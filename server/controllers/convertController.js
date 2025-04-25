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
  // Remove any currency code or prefix before the IBAN
  // Assuming currency is separated by a slash or space, or is a 3-letter code at the start
  const parts = accountNumber.split(/\/|\s+/);
  for (let part of parts) {
    // IBANs typically start with 2 letters followed by numbers (e.g., DE123456...)
    if (/^[A-Z]{2}\d{2}/.test(part)) {
      return part;
    }
  }
  // If no clear IBAN format is found, return the last part (common in MT940)
  return parts[parts.length - 1].trim();
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
      currentAccountNumber = cleanAccountNumber(rawAccountNumber); // Clean the account number
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
    accountNumber: accountNumber, // Cleaned account number (no currency) is used here
    shortValueDate: shortValueDate,
    isoValueDate: isoValueDate,
    displayDate: displayDate,
    amount: amount,
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
    .trim();
}

/**
 * Format transactions as CSV in the exact format of masterbalance.nl
 */
function formatMasterbalanceCSV(transactions) {
  let csv = "";
  transactions.forEach((tx) => {
    // Format each field exactly as masterbalance.nl does
    const accountNumber = `"${tx.accountNumber}"`; // Cleaned account number (no currency)
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
        tx.cdIndicator === "D" ? -parseFloat(tx.amount) : parseFloat(tx.amount),
      description: tx.description,
    }));
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
      { header: "Amount", key: "amount", width: 15 },
      { header: "Amount (comma)", key: "amountComma", width: 15 },
      { header: "D/C", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];
    // Add rows for each transaction
    latestTransactions.forEach((tx) => {
      const row = {
        accountNumber: tx.accountNumber, // Cleaned account number (no currency)
        shortValueDate: tx.shortValueDate,
        isoValueDate: tx.isoValueDate,
        displayDate: tx.displayDate,
        amount: tx.amount,
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
