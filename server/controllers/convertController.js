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
  console.log("Raw account number:", accountNumber);
  const parts = accountNumber.split(/\/|\s+|,|;|-|:/);
  for (let part of parts) {
    if (/^[A-Z]{2}\d{2}/.test(part)) {
      console.log("Cleaned IBAN found:", part);
      return part.trim();
    }
  }
  const currencyRegex = /^(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD)/i;
  const cleaned = accountNumber.replace(currencyRegex, "").trim();
  if (/^[A-Z]{2}\d{2}/.test(cleaned)) {
    console.log("Cleaned IBAN after removing currency code:", cleaned);
    return cleaned;
  }
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

/**
 * Parse transaction line and extract all required data
 */
function parseTransactionLine(line, accountNumber) {
  const txData = line.substring(4);
  const yymmdd = txData.substring(0, 6); // e.g., 240530
  const yearPrefix = yymmdd.startsWith("24") ? "20" : "19"; // Adjust based on year
  const year = yearPrefix + yymmdd.substring(0, 2); // e.g., 2024
  const month = yymmdd.substring(2, 4); // e.g., 05
  const day = yymmdd.substring(4, 6); // e.g., 30
  const isoDate = `${year}-${month}-${day}`; // e.g., 2024-05-30
  const displayDate = `${day}-${month}-${year}`; // e.g., 30-05-2024

  let cdIndicator = "D";
  let amountStr = "0.00";

  // Find C/D indicator position
  let cdPos = -1;
  for (let j = 6; j < txData.length; j++) {
    if (txData[j] === "C" || txData[j] === "D") {
      cdPos = j;
      break;
    }
  }

  if (cdPos > 0) {
    cdIndicator = txData[cdPos];
    // Extract amount after C/D until a delimiter (N, space, or end)
    let endPos = cdPos + 1;
    while (
      endPos < txData.length &&
      txData[endPos] !== "N" &&
      txData[endPos] !== " " &&
      txData[endPos] !== "\r" &&
      txData[endPos] !== "\n"
    ) {
      endPos++;
    }
    amountStr = txData.substring(cdPos + 1, endPos).trim();

    // Handle comma as decimal separator and ensure valid number
    if (amountStr.includes(",")) {
      amountStr = amountStr.replace(",", ".");
    }

    // Validate the amount format (e.g., 82.73 or 5.00)
    if (!amountStr.match(/^\d+\.?\d{0,2}$/)) {
      // Fallback to description field for amount if parsing fails
      const nextLineIndex = line.indexOf("\n") + 1;
      const description = line.substring(nextLineIndex) || "";
      const amountMatch = description.match(/OCMT EUR([\d,.]+)/);
      if (amountMatch && amountMatch[1]) {
        amountStr = amountMatch[1].replace(",", ".");
      } else {
        amountStr = "0.00"; // Ultimate fallback
      }
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
  const fullText = lines.join(" ");
  return fullText
    .replace(/\//g, " ") // Replace slashes with spaces as per MasterBalance.nl
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
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate.replace(/"/g, ""),
      amount:
        tx.cdIndicator === "D"
          ? -parseFloat(tx.amountDot.replace("R", "").replace(",", "."))
          : parseFloat(tx.amountDot.replace("R", "").replace(",", ".")),
      description: tx.description,
    }));
    console.log("Parsed transactions for API:", displayTransactions);
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
    latestTransactions.forEach((tx) => {
      const row = {
        accountNumber: tx.accountNumber,
        shortValueDate: tx.shortValueDate,
        isoValueDate: tx.isoValueDate,
        displayDate: tx.displayDate,
        amountDot: tx.amountDot,
        amountComma: tx.amountComma,
        cdIndicator: tx.cdIndicator,
        description: tx.description,
      };
      worksheet.addRow(row);
    });
    const filePath = path.join(__dirname, "..", "uploads", "statement.xlsx");
    await workbook.xlsx.writeFile(filePath);
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
    const csv = formatMasterbalanceCSV(latestTransactions);
    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error);
    res.status(500).json({ error: "Error generating CSV" });
  }
};
