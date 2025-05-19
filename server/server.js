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
  const yymmdd = txData.substring(0, 6); // e.g., 240530
  const yearPrefix = yymmdd.startsWith("24") ? "20" : "19"; // Assuming 24 is 2024
  const year = yearPrefix + yymmdd.substring(0, 2); // e.g., 2024
  const month = yymmdd.substring(2, 4); // e.g., 05
  const day = yymmdd.substring(4, 6); // e.g., 30
  const isoDate = `${year}-${month}-${day}`; // e.g., 2024-05-30
  const displayDate = `${day}-${month}-${year}`; // e.g., 30-05-2024

  let cdIndicator = "D";
  let amountStr = "0.00";
  let cdPos = -1;

  // Find the position of C or D
  for (let j = 6; j < txData.length; j++) {
    if (txData[j] === "C" || txData[j] === "D") {
      cdPos = j;
      cdIndicator = txData[j];
      break;
    }
  }

  if (cdPos > 0) {
    // Extract amount after C/D until a delimiter (N, space, or end)
    let endPos = txData.indexOf("N", cdPos);
    if (endPos === -1 || endPos > txData.length - 1) endPos = txData.length;
    amountStr = txData.substring(cdPos + 1, endPos).trim();

    // Handle comma as decimal separator and ensure valid number
    if (amountStr.includes(",")) {
      amountStr = amountStr.replace(",", ".");
    }
    if (!amountStr.match(/^\d+\.?\d{0,2}$/)) {
      amountStr = "0.00"; // Fallback if amount is invalid
    }
  }

  const amount = parseFloat(amountStr) || 0.0;
  const amountDot = `R${amount.toFixed(2)}`; // e.g., R82.73
  const amountComma = amountDot.replace(".", ","); // e.g., R82,73

  return {
    accountNumber: accountNumber,
    yymmdd: yymmdd,
    isoDate: isoDate,
    displayDate: displayDate,
    amountDot: amountDot,
    amountComma: amountComma,
    cdIndicator: cdIndicator,
    description: "",
  };
}

// Build a clean description from the structured data
function buildDescription(lines) {
  const fullText = lines.join(" ");
  return fullText
    .replace(/\//g, " ") // Replace slashes with spaces
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim()
    .replace(/"/g, '""'); // Escape double quotes for CSV
}

// Format transactions as CSV in the exact format of masterbalance.nl
function formatMasterbalanceCSV(transactions) {
  const header =
    [
      "Account Number",
      "YYMMDD",
      "YYYY-MM-DD",
      "DD-MM-YYYY",
      "Amount (Dot)",
      "Amount (Comma)",
      "C/D",
      "Description",
    ]
      .map((field) => `"${field}"`)
      .join(";") + "\n";

  const rows = transactions
    .map((tx) => {
      return [
        `"${tx.accountNumber}"`,
        `"${tx.yymmdd}"`,
        `"${tx.isoDate}"`,
        `"${tx.displayDate}"`,
        `"${tx.amountDot}"`,
        `"${tx.amountComma}"`,
        `"${tx.cdIndicator}"`,
        `"${tx.description}"`,
      ].join(";");
    })
    .join("\n");

  return header + rows;
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
            ? -parseFloat(tx.amountDot.replace("R", "").replace(",", "."))
            : parseFloat(tx.amountDot.replace("R", "").replace(",", ".")),
        description: tx.description,
      };
      console.log("Parsed transaction for API:", displayTx);
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
      { header: "Date (YYMMDD)", key: "yymmdd", width: 15 },
      { header: "Date (ISO)", key: "isoDate", width: 15 },
      { header: "Date", key: "displayDate", width: 15 },
      { header: "Amount", key: "amountDot", width: 15 },
      { header: "Amount (comma)", key: "amountComma", width: 15 },
      { header: "D/C", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];
    latestTransactions.forEach((tx) => {
      const row = {
        accountNumber: tx.accountNumber || "N/A",
        yymmdd: tx.yymmdd || "N/A",
        isoDate: tx.isoDate || "N/A",
        displayDate: tx.displayDate || "N/A",
        amountDot: tx.amountDot || "R0.00",
        amountComma: tx.amountComma || "R0,00",
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
