const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const http = require("http");
const https = require("https");
const fs = require("fs");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { execSync } = require("child_process");

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

// File filter to accept .mt940, .sta, .fin, and .txt files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".mt940", ".sta", ".fin", ".txt"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only .mt940, .sta, .fin, and .txt files are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Store transactions globally (for simplicity)
let latestTransactions = [];

/**
 * Clean account number to extract IBAN properly - IMPROVED VERSION
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
 * Parse MT940 file content - IMPROVED VERSION
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
 * Parse transaction line (:61:) - COMPLETELY REWRITTEN FOR BETTER ACCURACY
 */
function parseTransactionLine(line, accountNumber) {
  const txData = line.substring(4).trim(); // Remove ":61:" prefix
  console.log("Parsing transaction line:", txData);

  // MT940 :61: format: YYMMDD[MMDD]DebitCreditIndicator[Currency]Amount[TransactionReference]

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
  let cdIndicator = "C"; // Default to credit
  if (remainingData.length > 0 && /^[DC]/.test(remainingData)) {
    cdIndicator = remainingData.charAt(0);
    remainingData = remainingData.substring(1);
  }

  // Extract amount - more robust parsing
  let amountStr = "0.00";

  // Try different patterns for amount extraction
  const amountPatterns = [
    // Pattern 1: Optional currency code followed by amount
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

  // Format amounts (without R prefix for clean CSV export)
  const amountDot = amount.toFixed(2);
  const amountComma = amountDot.replace(".", ",");

  return {
    accountNumber: accountNumber || "UNKNOWN",
    yymmdd: yymmdd,
    isoDate: isoDate,
    displayDate: displayDate,
    amountDot: amountDot,
    amountComma: amountComma,
    cdIndicator: cdIndicator,
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

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// MT940 Conversion Endpoint - IMPROVED ERROR HANDLING
app.post("/api/convert", upload.single("file"), async (req, res) => {
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
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.header(
      "Content-Disposition",
      'attachment; filename="transactions.csv"'
    );
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error.message || error);
    res.status(500).json({ error: "Error generating CSV" });
  }
});

// Download Excel Endpoint - IMPROVED
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

    const uploadDir = path.join(__dirname, "Uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, "transactions.xlsx");
    console.log("Generating Excel file at:", filePath);
    await workbook.xlsx.writeFile(filePath);
    console.log("File generated successfully");

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Excel file not found" });
    }

    res.download(filePath, "transactions.xlsx", (err) => {
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
    if (!req.file) {
      return res.status(400).json({ error: "No .numbers file uploaded" });
    }

    const numbersFilePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    // Validate file extension
    if (fileExtension !== '.numbers') {
      return res.status(400).json({ 
        error: "Invalid file format. Please upload a .numbers file from Apple Numbers." 
      });
    }

    console.log("Processing Apple Numbers file:", req.file.originalname);
    console.log("File size:", req.file.size, "bytes");
    console.log("File path:", numbersFilePath);
    
    let conversionSuccess = false;
    let xlsxFilePath = null;
    const originalName = path.parse(req.file.originalname).name;
    
    // Method 1: Try AppleScript on macOS
    if (process.platform === 'darwin') {
      try {
        const tempDir = path.join(__dirname, 'Uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const outputPath = path.join(tempDir, `${originalName}.xlsx`);
        
        // Check if Numbers app is available
        console.log("Checking for Numbers app...");
        const { execSync } = require('child_process');
        
        try {
          execSync('osascript -e "tell application \\"Numbers\\" to version"', { timeout: 5000 });
          console.log("Numbers app found, attempting conversion...");
          
          // Use AppleScript to convert
          const appleScript = `
            tell application "Numbers"
              set theDoc to open POSIX file "${numbersFilePath}"
              export theDoc to file "${outputPath}" as Microsoft Excel
              close theDoc
            end tell
          `;
          
          execSync(`osascript -e '${appleScript}'`, { timeout: 60000 });
          
          if (fs.existsSync(outputPath)) {
            xlsxFilePath = outputPath;
            conversionSuccess = true;
            console.log("✅ Successfully converted using AppleScript");
          }
        } catch (numbersAppError) {
          console.log("❌ Numbers app not available or failed:", numbersAppError.message);
        }
      } catch (appleScriptError) {
        console.log("❌ AppleScript conversion failed:", appleScriptError.message);
      }
    } else {
      console.log("Not running on macOS, skipping AppleScript method");
    }
    
    // Method 2: Try extracting data from Numbers ZIP structure
    if (!conversionSuccess) {
      try {
        console.log("Attempting ZIP extraction method...");
        
        // Install adm-zip if not already installed
        const AdmZip = require('adm-zip');
        
        // Numbers files are actually ZIP archives
        const zip = new AdmZip(numbersFilePath);
        const entries = zip.getEntries();
        
        console.log(`Found ${entries.length} entries in Numbers file`);
        
        // Create basic workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Conversion Info');
        
        // Add header explaining the extraction
        worksheet.mergeCells('A1:C1');
        worksheet.getCell('A1').value = 'Apple Numbers File Analysis';
        worksheet.getCell('A1').font = { bold: true, size: 16 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getCell('A1').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        worksheet.getCell('A1').font.color = { argb: 'FFFFFFFF' };
        
        worksheet.addRow(['']);
        worksheet.addRow(['File Information:']);
        worksheet.addRow(['Original File:', req.file.originalname]);
        worksheet.addRow(['File Size:', `${(req.file.size / 1024).toFixed(1)} KB`]);
        worksheet.addRow(['Processing Date:', new Date().toLocaleString()]);
        worksheet.addRow(['Server Platform:', process.platform]);
        
        worksheet.addRow(['']);
        worksheet.addRow(['Conversion Status:', 'Requires Manual Conversion']);
        
        worksheet.addRow(['']);
        worksheet.addRow(['Why automatic conversion is limited:']);
        worksheet.addRow(['•', 'Numbers files use Apple\'s proprietary format']);
        worksheet.addRow(['•', 'Full conversion requires Apple Numbers app']);
        worksheet.addRow(['•', 'This server provides guidance for manual conversion']);
        
        worksheet.addRow(['']);
        worksheet.addRow(['Manual Conversion Steps:']);
        worksheet.addRow(['1.', 'Open your .numbers file in Apple Numbers']);
        worksheet.addRow(['2.', 'Click File → Export To → Excel']);
        worksheet.addRow(['3.', 'Choose "Excel" format (.xlsx)']);
        worksheet.addRow(['4.', 'Click "Next" and save the file']);
        
        worksheet.addRow(['']);
        worksheet.addRow(['Alternative Online Converters:']);
        worksheet.addRow(['•', 'CloudConvert.com (supports .numbers → .xlsx)']);
        worksheet.addRow(['•', 'Zamzar.com (online file converter)']);
        worksheet.addRow(['•', 'Online-Convert.com (various formats)']);
        
        worksheet.addRow(['']);
        worksheet.addRow(['File Structure Analysis:']);
        worksheet.addRow(['Entries found:', entries.length.toString()]);
        
        // List some key entries
        entries.slice(0, 10).forEach((entry, index) => {
          worksheet.addRow([`Entry ${index + 1}:`, entry.entryName]);
        });
        
        if (entries.length > 10) {
          worksheet.addRow(['...', `and ${entries.length - 10} more entries`]);
        }
        
        // Style the worksheet
        worksheet.getColumn(1).width = 5;
        worksheet.getColumn(2).width = 50;
        worksheet.getColumn(3).width = 20;
        
        // Style headers
        worksheet.getRow(3).font = { bold: true };
        worksheet.getRow(9).font = { bold: true };
        worksheet.getRow(15).font = { bold: true };
        worksheet.getRow(21).font = { bold: true };
        worksheet.getRow(27).font = { bold: true };
        
        xlsxFilePath = path.join(__dirname, 'Uploads', `${originalName}_conversion_guide.xlsx`);
        await workbook.xlsx.writeFile(xlsxFilePath);
        conversionSuccess = true;
        
        console.log("✅ Created conversion guide with file analysis");
        
      } catch (zipError) {
        console.log("❌ ZIP extraction failed:", zipError.message);
        console.log("Will create basic guidance file instead");
      }
    }
    
    // Method 3: Create basic guidance file if all else fails
    if (!conversionSuccess) {
      try {
        console.log("Creating basic guidance file...");
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Conversion Guide');
        
        worksheet.addRow(['Apple Numbers to Excel Converter']);
        worksheet.addRow(['']);
        worksheet.addRow(['Status:', 'Manual Conversion Required']);
        worksheet.addRow(['File:', req.file.originalname]);
        worksheet.addRow(['Size:', `${(req.file.size / 1024).toFixed(1)} KB`]);
        worksheet.addRow(['']);
        worksheet.addRow(['Instructions:']);
        worksheet.addRow(['1. Open the .numbers file in Apple Numbers']);
        worksheet.addRow(['2. Go to File → Export To → Excel']);
        worksheet.addRow(['3. Choose .xlsx format']);
        worksheet.addRow(['4. Save the converted file']);
        
        worksheet.getRow(1).font = { bold: true, size: 14 };
        worksheet.getColumn(1).width = 25;
        worksheet.getColumn(2).width = 40;
        
        xlsxFilePath = path.join(__dirname, 'Uploads', `${originalName}_guide.xlsx`);
        await workbook.xlsx.writeFile(xlsxFilePath);
        conversionSuccess = true;
        
        console.log("✅ Created basic conversion guide");
        
      } catch (guideError) {
        console.log("❌ Failed to create guidance file:", guideError.message);
        return res.status(500).json({ 
          error: "Failed to process file",
          details: guideError.message 
        });
      }
    }
    
    // Final check and response
    if (!conversionSuccess || !xlsxFilePath || !fs.existsSync(xlsxFilePath)) {
      return res.status(500).json({ 
        error: "Unable to process .numbers file",
        suggestion: "Please use Apple Numbers to export manually: File → Export To → Excel"
      });
    }
    
    // Send the file
    const outputFilename = `${originalName}.xlsx`;
    console.log("Sending file:", outputFilename);
    
    res.download(xlsxFilePath, outputFilename, (err) => {
      if (err) {
        console.error("❌ Error during file download:", err);
        res.status(500).json({ error: "Error downloading converted file" });
      } else {
        console.log("✅ File sent successfully:", outputFilename);
        
        // Clean up files after 30 seconds
        setTimeout(() => {
          [xlsxFilePath, numbersFilePath].forEach(filePath => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log("🧹 Cleaned up:", path.basename(filePath));
            }
          });
        }, 30000);
      }
    });
    
  } catch (error) {
    console.error("❌ Error in Numbers conversion:", error);
    res.status(500).json({ 
      error: "Error processing Numbers file",
      details: error.message,
      suggestion: "Try converting manually in Apple Numbers app"
    });
  }
});
// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 10MB." });
    }
  }

  if (error.message && error.message.includes("Invalid file type")) {
    return res.status(400).json({ error: error.message });
  }

  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server with SSL support
const startServer = () => {
  const certPath = "/etc/letsencrypt/live/mt940.axoplan.com/fullchain.pem";
  const keyPath = "/etc/letsencrypt/live/mt940.axoplan.com/privkey.pem";

  // Check if SSL certificates exist
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    // Start HTTPS server
    const options = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };

    https.createServer(options, app).listen(port, () => {
      console.log(
        `✅ HTTPS Server is running on https://mt940.axoplan.com:${port}`
      );
    });
  } else {
    // Fallback to HTTP for development
    http.createServer(app).listen(port, () => {
      console.log(`✅ HTTP Server is running on http://localhost:${port}`);
    });
  }
};

// Start the server
startServer();
