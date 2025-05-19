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

// Serve static files (Uploads)
app.use("/Uploads", express.static(path.join(__dirname, "Uploads")));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "Uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// File filter to accept .mt940, .sta, and .fin files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".mt940", ".sta", ".fin"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only .mt940, .sta, and .fin files are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

// Store transactions globally (for simplicity)
let latestTransactions = [];

/**
 * Clean account number to remove currency or other prefixes/suffixes
 */
function cleanAccountNumber(accountNumber) {
  console.log("Raw account number:", accountNumber);
  const parts = accountNumber.split(/\/|\s+|,|;|-|:/);
  for (let part of parts) {
    if (/^[A-Z]{2}\d{2}/.test(part)) {
      console.log("Cleaned IBAN found:", part);
      return part.trim();
    }
  }
  const currencyRegex = /^(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD)/i;
  let cleaned = accountNumber.replace(currencyRegex, "").trim();
  cleaned = cleaned
    .replace(/(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD)$/i, "")
    .trim();
  if (/^[A-Z]{2}\d{2}/.test(cleaned)) {
    console.log("Cleaned IBAN after removing currency code:", cleaned);
    return cleaned;
  }
  const fallback = parts[parts.length - 1].trim();
  console.log("No clear IBAN format found, using fallback:", fallback);
  return fallback;
}

// Parse MT940 file content
function parseMT940(content) {
  const transactions = [];
  const lines = content.split("\n");
  let currentAccountNumber = "";
  let currentTransaction = null;
  let descriptionLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(":25:")) {
      const rawAccountNumber = line.substring(4);
      currentAccountNumber = cleanAccountNumber(rawAccountNumber);
    } else if (line.startsWith(":61:")) {
      if (currentTransaction) {
        if (descriptionLines.length > 0) {
          currentTransaction.description = buildDescription(descriptionLines);
        }
        transactions.push(currentTransaction);
      }
      currentTransaction = parseTransactionLine(line, currentAccountNumber);
      descriptionLines = [];
    } else if (line.startsWith(":86:") && currentTransaction) {
      descriptionLines.push(line.substring(4));
    } else if (
      currentTransaction &&
      descriptionLines.length > 0 &&
      !line.startsWith(":")
    ) {
      descriptionLines.push(line);
    }
  }
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
  const txData = line.substring(4);
  const valueYY = txData.substring(0, 2);
  const valueMM = txData.substring(2, 4);
  const valueDD = txData.substring(4, 6);
  let entryDD = valueDD;
  let entryMM = valueMM;
  let entryYY = valueYY;
  let cdPos = -1;
  for (let j = 6; j < txData.length; j++) {
    if (txData[j] === "C" || txData[j] === "D") {
      cdPos = j;
      break;
    }
  }
  if (cdPos >= 10) {
    const entryDate = txData.substring(6, 10);
    if (/^\d{4}$/.test(entryDate)) {
      entryMM = entryDate.substring(0, 2);
      entryDD = entryDate.substring(2, 4);
    }
  }
  const shortValueDate = `${valueYY}${valueMM}${valueDD}`;
  const isoValueDate = `20${valueYY}-${valueMM}-${valueDD}`;
  const displayDate = `${entryDD}-${entryMM}-20${valueYY}`;
  let amount = "0";
  let amountComma = "0";
  let cdIndicator = "D";
  if (cdPos > 0) {
    cdIndicator = txData[cdPos];
    const nPos = txData.indexOf("N", cdPos);
    if (nPos > cdPos) {
      amount = txData.substring(cdPos + 1, nPos);
      amountComma = amount;
      amount = amount.replace(",", ".");
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
  const fullText = lines.join(" ");
  return fullText.replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

// Format transactions as CSV in the exact format of masterbalance.nl
function formatMasterbalanceCSV(transactions) {
  let csv = "";
  transactions.forEach((tx) => {
    const accountNumber = `"${tx.accountNumber}"`;
    const shortDate = `"${tx.shortValueDate}"`;
    const isoDate = `"${tx.isoValueDate}"`;
    const displayDate = `"${tx.displayDate}"`;
    const amountDot = `"${tx.amount}"`;
    const amountComma = `"${tx.amountComma}"`;
    const cdIndicator = `"${tx.cdIndicator}"`;
    const description = `"${tx.description.replace(/"/g, '""')}"`;
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

// MT940 Conversion Endpoint
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    console.log("Processing file:", req.file.path);
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    console.log("File content read, parsing MT940...");
    const transactions = parseMT940(fileContent);
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => {
      const displayTx = {
        date: tx.displayDate.replace(/"/g, ""),
        amount:
          tx.cdIndicator === "D"
            ? -parseFloat(tx.amount)
            : parseFloat(tx.amount),
        description: tx.description,
      };
      console.log("Parsed transaction for API:", displayTx); // Add this line
      return displayTx;
    });
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
        "No transactions available for download. Please upload and process an MT940, STA, or FIN file first.",
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
        "No transactions available for download. Please upload and process an MT940, STA, or FIN file first.",
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
    const uploadDir = path.join(__dirname, "Uploads");
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

// Numbers to XLSX Conversion Endpoint
app.post("/api/convert-numbers", upload.single("file"), async (req, res) => {
  try {
    let numbersArray = [];
    if (req.file) {
      const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
      numbersArray = fileContent
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.split(",").map((val) => val.trim()));
    } else if (req.body.numbersData) {
      numbersArray = req.body.numbersData
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.split(",").map((val) => val.trim()));
    } else {
      return res
        .status(400)
        .json({ error: "No numbers data or file provided" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Numbers");
    numbersArray.forEach((row) => {
      worksheet.addRow(row);
    });

    const uploadDir = path.join(__dirname, "Uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, "numbers.xlsx");
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, "numbers.xlsx", (err) => {
      if (err) {
        console.error("Error during file download:", err);
        res.status(500).json({ error: "Error downloading the file" });
      }
    });
  } catch (error) {
    console.error("Error converting numbers to XLSX:", error);
    res.status(500).json({ error: "Error converting numbers to XLSX" });
  }
});

// Use axoplan SSL cert
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
