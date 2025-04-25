const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const multer = require("multer");
const ExcelJS = require("exceljs");
const app = express();

app.use(cors());
const port = process.env.PORT || 5002;

// Middleware to parse JSON
app.use(bodyParser.json());

// Serve static files (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Store transactions globally (for simplicity)
let latestTransactions = [];

// MT940 Conversion Endpoint
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    console.log("Processing file:", req.file.path);
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    console.log("File content read, parsing MT940...");
    const transactions = parseMT940(fileContent);
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate.replace(/"/g, ""),
      amount:
        tx.cdIndicator === "D" ? -parseFloat(tx.amount) : parseFloat(tx.amount),
      description: tx.description,
    }));
    console.log("Transactions parsed successfully:", transactions.length);
    res.json({ transactions: displayTransactions });
  } catch (error) {
    console.error("Error parsing MT940 file:", error.message || error);
    res.status(500).json({ error: "Error parsing MT940 file" });
  }
});

// Download CSV Endpoint
app.get("/api/download/csv", (req, res) => {
  if (latestTransactions.length === 0) {
    return res.status(400).json({
      error:
        "No transactions available for download. Please upload and process an MT940 file first.",
    });
  }
  try {
    const csv = formatMasterbalanceCSV(latestTransactions);
    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error.message || error);
    res.status(500).json({ error: "Error generating CSV" });
  }
});

// Download Excel Endpoint
app.get("/api/download/excel", async (req, res) => {
  if (latestTransactions.length === 0) {
    return res.status(400).json({
      error:
        "No transactions available for download. Please upload and process an MT940 file first.",
    });
  }
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");
    worksheet.columns = [
      { header: "Account", key: "accountNumber", width: 25 },
      { header: "Date (YYMMDD)", key: "shortValueDate", width: 15 },
      { header: "Date (ISO)", key: "isoValueDate", width: 15 },
      { header: "Date", key: "displayDate", width: 15 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Amount (comma)", key: "amountComma", width: 15 },
      { header: "D/C", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];
    latestTransactions.forEach((tx) => {
      const row = {
        accountNumber: tx.accountNumber || "N/A",
        shortValueDate: tx.shortValueDate || "N/A",
        isoValueDate: tx.isoValueDate || "N/A",
        displayDate: tx.displayDate || "N/A",
        amount: tx.amount || "0.00",
        amountComma: tx.amountComma || "0,00",
        cdIndicator: tx.cdIndicator || "N/A",
        description: tx.description || "N/A",
      };
      worksheet.addRow(row);
    });
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, "statement.xlsx");
    console.log("Generating Excel file at:", filePath);
    await workbook.xlsx.writeFile(filePath);
    console.log("File generated successfully");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Excel file not found" });
    }
    res.download(filePath, "statement.xlsx", (err) => {
      if (err) {
        console.error("Error during file download:", err.message || err);
        res.status(500).json({ error: "Error downloading the file" });
      }
    });
  } catch (error) {
    console.error("Error generating Excel file:", error.message || error);
    res.status(500).json({ error: "Error generating Excel file" });
  }
});

// Parse MT940 file content (full implementation)
function parseMT940(content) {
  const transactions = [];
  const lines = content.split("\n");
  let currentAccountNumber = "";
  let currentTransaction = null;
  let descriptionLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Account number line
    if (line.startsWith(":25:")) {
      currentAccountNumber = line.substring(4);
    }
    // Transaction line
    else if (line.startsWith(":61:")) {
      // Save previous transaction if exists
      if (currentTransaction) {
        if (descriptionLines.length > 0) {
          currentTransaction.description = buildDescription(descriptionLines);
        }
        transactions.push(currentTransaction);
      }
      // Parse new transaction
      currentTransaction = parseTransactionLine(line, currentAccountNumber);
      descriptionLines = [];
    }
    // Description line
    else if (line.startsWith(":86:") && currentTransaction) {
      descriptionLines.push(line.substring(4));
    }
    // Continuation of description
    else if (
      currentTransaction &&
      descriptionLines.length > 0 &&
      !line.startsWith(":")
    ) {
      descriptionLines.push(line);
    }
  }
  // Don't forget the last transaction
  if (currentTransaction) {
    if (descriptionLines.length > 0) {
      currentTransaction.description = buildDescription(descriptionLines);
    }
    transactions.push(currentTransaction);
  }
  return transactions;
}

// Parse transaction line and extract all required data
function parseTransactionLine(line, accountNumber) {
  // Remove :61: prefix
  const txData = line.substring(4);
  // Extract the value date (first 6 chars are YYMMDD)
  const valueYY = txData.substring(0, 2);
  const valueMM = txData.substring(2, 4);
  const valueDD = txData.substring(4, 6);
  // Initialize with value date
  let entryDD = valueDD;
  let entryMM = valueMM;
  let entryYY = valueYY;
  // Find C/D indicator position
  let cdPos = -1;
  for (let j = 6; j < txData.length; j++) {
    if (txData[j] === "C" || txData[j] === "D") {
      cdPos = j;
      break;
    }
  }
  // Check for entry date (MMDD) between value date and C/D
  if (cdPos >= 10) {
    const entryDate = txData.substring(6, 10);
    if (/^\d{4}$/.test(entryDate)) {
      entryMM = entryDate.substring(0, 2);
      entryDD = entryDate.substring(2, 4);
    }
  }
  // Format dates exactly as masterbalance.nl does
  const shortValueDate = `${valueYY}${valueMM}${valueDD}`; // YYMMDD
  const isoValueDate = `20${valueYY}-${valueMM}-${valueDD}`; // YYYY-MM-DD
  const displayDate = `${entryDD}-${entryMM}-20${valueYY}`; // DD-MM-YYYY
  // Extract credit/debit indicator and amount
  let amount = "0";
  let amountComma = "0";
  let cdIndicator = "D"; // Default to debit
  if (cdPos > 0) {
    cdIndicator = txData[cdPos];
    // Extract amount
    const nPos = txData.indexOf("N", cdPos);
    if (nPos > cdPos) {
      amount = txData.substring(cdPos + 1, nPos);
      // Store both formats of the amount (with dot and with comma)
      amountComma = amount; // With comma as is in the file
      amount = amount.replace(",", "."); // With dot for calculations
      // Ensure trailing zeroes are handled like masterbalance.nl does
      if (!amount.includes(".")) {
        amount = amount + ".";
      }
      if (!amountComma.includes(",")) {
        amountComma = amountComma + ",";
      }
    }
  }
  return {
    accountNumber: accountNumber,
    shortValueDate: shortValueDate,
    isoValueDate: isoValueDate,
    displayDate: displayDate,
    amount: amount,
    amountComma: amountComma,
    cdIndicator: cdIndicator,
    description: "",
  };
}

// Build a clean description from the structured data
function buildDescription(lines) {
  // Join all lines
  const fullText = lines.join(" ");
  // This format exactly matches masterbalance.nl's output - they simply replace
  // the slashes with spaces and clean up whitespace
  return fullText
    .replace(/\//g, " ") // Replace all slashes with spaces
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

// Format transactions as CSV in the exact format of masterbalance.nl
function formatMasterbalanceCSV(transactions) {
  let csv = "";
  transactions.forEach((tx) => {
    // Format each field exactly as masterbalance.nl does
    const accountNumber = `"${tx.accountNumber}"`;
    const shortDate = `"${tx.shortValueDate}"`;
    const isoDate = `"${tx.isoValueDate}"`;
    const displayDate = `"${tx.displayDate}"`;
    const amountDot = `"${tx.amount}"`;
    const amountComma = `"${tx.amountComma}"`;
    const cdIndicator = `"${tx.cdIndicator}"`;
    const description = `"${tx.description.replace(/"/g, '""')}"`;
    // Join with semicolons exactly as masterbalance.nl does
    const line = [
      accountNumber,
      shortDate,
      isoDate,
      displayDate,
      amountDot,
      amountComma,
      cdIndicator,
      description,
    ].join(";");
    csv += line + "\n";
  });
  return csv;
}

// ✅ Use axoplan SSL cert (valid for all subdomains like mt940.axoplan.com)
const options = {
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/mt940.axoplan.com/fullchain.pem"
  ),
  key: fs.readFileSync("/etc/letsencrypt/live/mt940.axoplan.com/privkey.pem"),
};

// Start HTTPS server
https.createServer(options, app).listen(port, () => {
  console.log(`✅ Server is running on https://mt940.axoplan.com:${port}`);
});
