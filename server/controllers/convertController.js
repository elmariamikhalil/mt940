/**
 * MT940 to CSV/Excel Converter
 * Exactly matching the output format of masterbalance.nl
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");
let latestTransactions = []; // Store transactions for download

/**
 * Clean account number to remove currency or other prefixes/suffixes
 */
function cleanAccountNumber(accountNumber) {
  // Log the raw account number for debugging
  console.log("Raw account number:", accountNumber);

  // Remove any currency code or prefix before the IBAN
  // Handle common separators: slash, space, comma, semicolon, hyphen, or other delimiters
  const parts = accountNumber.split(/\/|\s+|,|;|-|:/);
  for (let part of parts) {
    // IBANs typically start with 2 letters followed by numbers (e.g., DE123456...)
    if (/^[A-Z]{2}\d{2}/.test(part)) {
      console.log("Cleaned IBAN found:", part);
      return part.trim();
    }
  }
  // If no clear IBAN format is found, try to remove known currency codes explicitly
  const currencyRegex = /^(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD)/i;
  const cleaned = accountNumber.replace(currencyRegex, "").trim();
  if (/^[A-Z]{2}\d{2}/.test(cleaned)) {
    console.log("Cleaned IBAN after removing currency code:", cleaned);
    return cleaned;
  }
  // As a last resort, return the last part as fallback (common in MT940)
  const fallback = parts[parts.length - 1].trim();
  console.log("No clear IBAN format found, using fallback:", fallback);
  return fallback;
}

/**
 * Parse MT940 file content
 */
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
      const rawAccountNumber = line.substring(4);
      currentAccountNumber = cleanAccountNumber(rawAccountNumber); // Clean the account number to remove currency
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

/**
 * Parse transaction line and extract all required data
 */
function parseTransactionLine(line, accountNumber) {
  // Remove :61: prefix
  const txData = line.substring(4);
  // Extract the value date (first 6 chars are YYMMDD)
  const yymmdd = txData.substring(0, 6); // e.g., 240530
  const yearPrefix = yymmdd.startsWith("24") ? "20" : "19"; // Assuming 24 is 2024
  const year = yearPrefix + yymmdd.substring(0, 2); // e.g., 2024
  const month = yymmdd.substring(2, 4); // e.g., 05
  const day = yymmdd.substring(4, 6); // e.g., 30
  const isoDate = `${year}-${month}-${day}`; // e.g., 2024-05-30
  const displayDate = `${day}-${month}-${year}`; // e.g., 30-05-2024

  // Find C/D indicator position
  let cdPos = -1;
  for (let j = 6; j < txData.length; j++) {
    if (txData[j] === "C" || txData[j] === "D") {
      cdPos = j;
      break;
    }
  }

  let cdIndicator = "D";
  let amountStr = "0.00";
  if (cdPos > 0) {
    cdIndicator = txData[cdPos];
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
    shortValueDate: yymmdd,
    isoValueDate: isoDate,
    displayDate: displayDate,
    amountDot: amountDot,
    amountComma: amountComma,
    cdIndicator: cdIndicator,
    description: "",
  };
}

/**
 * Build a clean description from the structured data
 */
function buildDescription(lines) {
  // Join all lines
  const fullText = lines.join(" ");
  // This format exactly matches masterbalance.nl's output - they simply replace
  // the slashes with spaces and clean up whitespace
  return fullText
    .replace(/\//g, " ") // Replace all slashes with spaces
    .replace(/\s+/g, " ") // Normalize spaces
    .trim()
    .replace(/"/g, '""'); // Escape double quotes for CSV
}

/**
 * Format transactions as CSV in the exact format of masterbalance.nl
 */
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
        `"${tx.shortValueDate}"`,
        `"${tx.isoValueDate}"`,
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

// Handle conversion of the uploaded MT940 file
exports.handleConvert = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    const transactions = parseMT940(fileContent);
    // Store for later use
    latestTransactions = transactions;
    // Send simplified version for display
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate.replace(/"/g, ""),
      amount:
        tx.cdIndicator === "D"
          ? -parseFloat(tx.amountDot.replace("R", "").replace(",", "."))
          : parseFloat(tx.amountDot.replace("R", "").replace(",", ".")),
      description: tx.description,
    }));
    console.log("Parsed transactions for API:", displayTransactions); // Add for debugging
    res.json({ transactions: displayTransactions });
  } catch (error) {
    console.error("Error parsing MT940 file:", error);
    res.status(500).json({ error: "Error parsing MT940 file" });
  }
};

// Handle download of transactions as an Excel file
exports.downloadExcel = async (req, res) => {
  if (latestTransactions.length === 0) {
    return res
      .status(400)
      .json({ error: "No transactions available for download" });
  }
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");
    // Define columns with masterbalance.nl format
    worksheet.columns = [
      { header: "Account", key: "accountNumber", width: 25 },
      { header: "Date (YYMMDD)", key: "shortValueDate", width: 15 },
      { header: "Date (ISO)", key: "isoValueDate", width: 15 },
      { header: "Date", key: "displayDate", width: 15 },
      { header: "Amount", key: "amountDot", width: 15 },
      { header: "Amount (comma)", key: "amountComma", width: 15 },
      { header: "D/C", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];
    // Add rows for each transaction
    latestTransactions.forEach((tx) => {
      const row = {
        accountNumber: tx.accountNumber,
        shortValueDate: tx.shortValueDate,
        isoValueDate: tx.isoValueDate,
        displayDate: tx.displayDate,
        amount: tx.amountDot,
        amountComma: tx.amountComma,
        cdIndicator: tx.cdIndicator,
        description: tx.description,
      };
      worksheet.addRow(row);
    });
    // Set the file path
    const filePath = path.join(__dirname, "..", "uploads", "statement.xlsx");
    await workbook.xlsx.writeFile(filePath);
    // Download the file
    res.download(filePath, "statement.xlsx", (err) => {
      if (err) {
        console.error("Error during file download:", err);
        res.status(500).json({ error: "Error downloading the file" });
      }
    });
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res.status(500).json({ error: "Error generating Excel file" });
  }
};

// Handle download of transactions as a CSV file
exports.downloadCSV = (req, res) => {
  if (latestTransactions.length === 0) {
    return res
      .status(400)
      .json({ error: "No transactions available for download" });
  }
  try {
    // Use the custom formatter to match masterbalance.nl exactly
    const csv = formatMasterbalanceCSV(latestTransactions);
    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error);
    res.status(500).json({ error: "Error generating CSV" });
  }
};
