/**
 * MT940 to CSV/Excel Converter - FIXED VERSION
 * Properly handles MT940 parsing with comprehensive field extraction
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

let latestTransactions = []; // Store transactions for download

/**
 * Clean account number to extract IBAN properly
 */
function cleanAccountNumber(accountNumber) {
  console.log("Raw account number:", accountNumber);

  // Remove common prefixes and suffixes
  let cleaned = accountNumber.trim();

  // Split by common delimiters and look for IBAN pattern
  const parts = cleaned.split(/[\/\s,;:\-]+/);

  for (let part of parts) {
    part = part.trim();
    // Look for IBAN pattern (2 letters + 2 digits + up to 30 alphanumeric)
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(part)) {
      console.log("Found IBAN:", part.toUpperCase());
      return part.toUpperCase();
    }
  }

  // Remove currency codes from beginning and end
  const currencyRegex = /^(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD|ZAR)/i;
  cleaned = cleaned.replace(currencyRegex, "").trim();
  cleaned = cleaned
    .replace(/(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD|ZAR)$/i, "")
    .trim();

  // Check again after currency removal
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(cleaned)) {
    console.log("Found IBAN after currency removal:", cleaned.toUpperCase());
    return cleaned.toUpperCase();
  }

  // Fallback to the longest alphanumeric part
  const fallback = parts.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    ""
  );

  console.log("Using fallback account number:", fallback);
  return fallback.trim();
}

/**
 * Parse MT940 file content with proper field handling
 */
function parseMT940(content) {
  const transactions = [];
  const lines = content.split(/\r?\n/); // Handle both Unix and Windows line endings

  let currentAccountNumber = "";
  let currentTransaction = null;
  let descriptionLines = [];

  console.log(`Processing ${lines.length} lines`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith(":25:")) {
      // Account identification
      const rawAccountNumber = line.substring(4).trim();
      currentAccountNumber = cleanAccountNumber(rawAccountNumber);
      console.log("Set account number:", currentAccountNumber);
    } else if (line.startsWith(":61:")) {
      // Statement line (transaction)
      if (currentTransaction) {
        // Finalize previous transaction
        if (descriptionLines.length > 0) {
          currentTransaction.description = buildDescription(descriptionLines);
        }
        transactions.push(currentTransaction);
      }

      // Parse new transaction
      currentTransaction = parseTransactionLine(line, currentAccountNumber);
      descriptionLines = [];
      console.log("Parsed transaction:", currentTransaction);
    } else if (line.startsWith(":86:")) {
      // Transaction details/description
      if (currentTransaction) {
        descriptionLines.push(line.substring(4).trim());
      }
    } else if (
      currentTransaction &&
      descriptionLines.length > 0 &&
      !line.startsWith(":") &&
      line.length > 0
    ) {
      // Continuation of description
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

  console.log(`Parsed ${transactions.length} transactions`);
  return transactions;
}

/**
 * Parse transaction line (:61:) with comprehensive field extraction
 */
function parseTransactionLine(line, accountNumber) {
  const txData = line.substring(4).trim(); // Remove ":61:" prefix
  console.log("Parsing transaction line:", txData);

  // MT940 :61: format: YYMMDD[MMDD]DebitCreditIndicator[Currency]Amount[TransactionReference]
  // Pattern: YYMMDD + optional MMDD + D/C + optional currency + amount + optional reference

  // Extract date (first 6 characters - YYMMDD)
  const yymmdd = txData.substring(0, 6);

  // Determine year (assuming 20xx for years 00-30, 19xx for years 31-99)
  const year = parseInt(yymmdd.substring(0, 2));
  const fullYear = year <= 30 ? 2000 + year : 1900 + year;
  const month = yymmdd.substring(2, 4);
  const day = yymmdd.substring(4, 6);

  // Create date objects
  const isoDate = `${fullYear}-${month}-${day}`;
  const displayDate = `${day}-${month}-${fullYear}`;

  // Extract remaining data after date
  let remainingData = txData.substring(6);

  // Skip optional booking date (MMDD) if present
  if (remainingData.length >= 4 && /^\d{4}/.test(remainingData)) {
    remainingData = remainingData.substring(4);
  }

  // Extract credit/debit indicator (D or C)
  let cdIndicator = "";
  if (remainingData.length > 0 && /^[DC]/.test(remainingData)) {
    cdIndicator = remainingData.charAt(0);
    remainingData = remainingData.substring(1);
  }

  // Extract amount - more robust parsing
  let amountStr = "0.00";

  // Try different patterns for amount extraction
  const amountPatterns = [
    // Pattern 1: Direct amount after C/D indicator
    /^([A-Z]{3})?(\d+[,.]?\d*)/,
    // Pattern 2: Amount with currency code
    /^([A-Z]{3})(\d+[,.]?\d*)/,
    // Pattern 3: Just digits with optional decimal
    /^(\d+[,.]?\d*)/,
  ];

  for (const pattern of amountPatterns) {
    const match = remainingData.match(pattern);
    if (match) {
      // Extract amount part (skip currency if present)
      amountStr = match[2] || match[1];
      if (amountStr && /^\d/.test(amountStr)) {
        break;
      }
    }
  }

  // Clean and validate amount
  amountStr = amountStr.replace(/[^\d.,]/g, ""); // Remove non-numeric chars except . and ,
  amountStr = amountStr.replace(/,/g, "."); // Convert comma to dot for decimal

  // Ensure valid decimal format
  if (!/^\d+\.?\d*$/.test(amountStr)) {
    console.warn("Invalid amount format, using 0.00:", amountStr);
    amountStr = "0.00";
  }

  // Parse amount
  const amount = parseFloat(amountStr) || 0.0;

  // Format amounts
  const amountDot = amount.toFixed(2);
  const amountComma = amountDot.replace(".", ",");

  return {
    accountNumber: accountNumber || "UNKNOWN",
    yymmdd: yymmdd,
    isoDate: isoDate,
    displayDate: displayDate,
    amountDot: amountDot,
    amountComma: amountComma,
    cdIndicator: cdIndicator || "C",
    description: "",
    rawAmount: amount, // Store raw amount for processing
  };
}

/**
 * Build a clean description from the structured data
 */
function buildDescription(lines) {
  if (!lines || lines.length === 0) return "";

  const fullText = lines.join(" ");
  return fullText
    .replace(/\//g, " ") // Replace slashes with spaces
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim()
    .replace(/"/g, '""'); // Escape double quotes for CSV
}

/**
 * Format transactions as CSV matching masterbalance.nl format
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

/**
 * Handle conversion of uploaded MT940 file
 */
exports.handleConvert = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    console.log("Processing file:", req.file.path);
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    console.log("File content length:", fileContent.length);

    const transactions = parseMT940(fileContent);
    latestTransactions = transactions;

    // Format transactions for API response
    const displayTransactions = transactions.map((tx) => {
      const amount = tx.cdIndicator === "D" ? -tx.rawAmount : tx.rawAmount;
      return {
        date: tx.displayDate.replace(/"/g, ""),
        amount: amount,
        description: tx.description || "",
        cdIndicator: tx.cdIndicator,
        accountNumber: tx.accountNumber,
      };
    });

    console.log(`Successfully parsed ${transactions.length} transactions`);
    res.json({
      transactions: displayTransactions,
      summary: {
        totalTransactions: transactions.length,
        accountNumber: transactions[0]?.accountNumber || "UNKNOWN",
      },
    });
  } catch (error) {
    console.error("Error parsing MT940 file:", error);
    res.status(500).json({
      error: "Error parsing MT940 file",
      details: error.message,
    });
  }
};

/**
 * Handle download of transactions as Excel file
 */
exports.downloadExcel = async (req, res) => {
  if (latestTransactions.length === 0) {
    return res.status(400).json({
      error: "No transactions available for download",
    });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");

    // Set column headers and widths
    worksheet.columns = [
      { header: "Account Number", key: "accountNumber", width: 25 },
      { header: "Date (YYMMDD)", key: "yymmdd", width: 15 },
      { header: "Date (ISO)", key: "isoDate", width: 15 },
      { header: "Date (Display)", key: "displayDate", width: 15 },
      { header: "Amount (Dot)", key: "amountDot", width: 15 },
      { header: "Amount (Comma)", key: "amountComma", width: 15 },
      { header: "C/D", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];

    // Add transaction rows
    latestTransactions.forEach((tx) => {
      worksheet.addRow({
        accountNumber: tx.accountNumber || "N/A",
        yymmdd: tx.yymmdd || "N/A",
        isoDate: tx.isoDate || "N/A",
        displayDate: tx.displayDate || "N/A",
        amountDot: tx.amountDot || "0.00",
        amountComma: tx.amountComma || "0,00",
        cdIndicator: tx.cdIndicator || "C",
        description: tx.description || "",
      });
    });

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, "transactions.xlsx");
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, "transactions.xlsx", (err) => {
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

/**
 * Handle download of transactions as CSV file
 */
exports.downloadCSV = (req, res) => {
  if (latestTransactions.length === 0) {
    return res.status(400).json({
      error: "No transactions available for download",
    });
  }

  try {
    const csv = formatMasterbalanceCSV(latestTransactions);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.header(
      "Content-Disposition",
      'attachment; filename="transactions.csv"'
    );
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error);
    res.status(500).json({ error: "Error generating CSV" });
  }
};
