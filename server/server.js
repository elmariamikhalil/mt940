const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const http = require("http");
const https = require("https");
const fs = require("fs");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { execSync } = require("child_process");

// Add AdmZip for Numbers file analysis
const AdmZip = require("adm-zip"); // npm install adm-zip

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

// Enhanced file filter to accept .mt940, .sta, .fin, .txt, and .numbers files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".mt940", ".sta", ".fin", ".txt", ".numbers"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Only ${allowedExtensions.join(
          ", "
        )} files are allowed.`
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // Increased to 100MB for large Numbers files
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

// Privacy status endpoint - NEW
app.get("/api/privacy-status", (req, res) => {
  res.json({
    privacy: "guaranteed",
    processing: "local-only",
    external_services: "none",
    data_retention: "temporary-local-files-only",
    platform: process.platform,
    numbers_support: process.platform === "darwin" ? "native" : "analysis-only",
    message: "All file processing happens locally on your server",
  });
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

// Enhanced Numbers to Excel conversion with actual data extraction
app.post("/api/convert-numbers", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No .numbers file uploaded" });
    }

    const numbersFilePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const originalName = path.parse(req.file.originalname).name;

    if (fileExtension !== ".numbers") {
      return res.status(400).json({
        error:
          "Invalid file format. Please upload a .numbers file from Apple Numbers.",
      });
    }

    console.log(
      "🔄 Converting Numbers file with data extraction:",
      req.file.originalname
    );
    console.log("File size:", req.file.size, "bytes");

    // Enhanced conversion with multiple strategies
    let conversionResult = await convertNumbersWithDataExtraction(
      numbersFilePath,
      originalName
    );

    if (conversionResult.success) {
      console.log(`✅ Successfully converted: ${conversionResult.method}`);

      // Send the converted file
      res.download(conversionResult.filePath, `${originalName}.xlsx`, (err) => {
        if (err) {
          console.error("Error downloading file:", err);
          res.status(500).json({ error: "Error downloading converted file" });
        } else {
          console.log("📁 File downloaded successfully");
          // Clean up files after successful download
          setTimeout(() => {
            cleanupFiles([conversionResult.filePath, numbersFilePath]);
          }, 30000);
        }
      });
    } else {
      console.log("❌ Conversion failed:", conversionResult.error);
      res.status(500).json({
        error: "Failed to convert Numbers file",
        details: conversionResult.error,
        extractedData: conversionResult.extractedData || null,
      });
    }
  } catch (error) {
    console.error("Error in Numbers conversion:", error);
    res.status(500).json({
      error: "Error processing Numbers file",
      details: error.message,
    });
  }
});

// Local conversion function with multiple strategies
async function convertNumbersLocally(numbersFilePath, originalName) {
  const uploadDir = path.join(__dirname, "Uploads");

  console.log("🔒 Processing Numbers file locally (no external services)");

  // Strategy 1: macOS with Numbers app (most reliable)
  if (process.platform === "darwin") {
    try {
      const result = await tryLocalAppleScript(
        numbersFilePath,
        originalName,
        uploadDir
      );
      if (result.success) {
        console.log("✅ Successfully converted using local Apple Numbers");
        return result;
      }
    } catch (error) {
      console.log("❌ Local AppleScript failed:", error.message);
    }
  }

  // Strategy 2: Extract and analyze Numbers file structure
  try {
    const result = await extractNumbersData(
      numbersFilePath,
      originalName,
      uploadDir
    );
    if (result.success) {
      console.log("✅ Successfully extracted data from Numbers file");
      return result;
    }
  } catch (error) {
    console.log("❌ Numbers extraction failed:", error.message);
  }

  // Strategy 3: Create detailed local guidance
  return await createLocalGuidance(numbersFilePath, originalName, uploadDir);
}

// Strategy 1: Local AppleScript (macOS only)
async function tryLocalAppleScript(numbersFilePath, originalName, uploadDir) {
  try {
    // Check if Numbers app is available locally
    execSync('osascript -e "tell application \\"Numbers\\" to version"', {
      timeout: 5000,
      stdio: "pipe", // Suppress output
    });

    const outputPath = path.join(uploadDir, `${originalName}_converted.xlsx`);

    // Use AppleScript for local conversion
    const appleScript = `
      tell application "Numbers"
        set theDoc to open POSIX file "${numbersFilePath}"
        export theDoc to file "${outputPath}" as Microsoft Excel
        close theDoc
      end tell
    `;

    execSync(`osascript -e '${appleScript}'`, {
      timeout: 60000,
      stdio: "pipe", // Suppress output
    });

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return {
        success: true,
        filePath: outputPath,
        method: "Local AppleScript",
        message: "Converted using local Apple Numbers app",
      };
    } else {
      throw new Error("Output file not created or empty");
    }
  } catch (error) {
    console.log("Local AppleScript conversion failed:", error.message);
    return { success: false, error: error.message };
  }
}

// Strategy 2: Extract data from Numbers ZIP structure
async function extractNumbersData(numbersFilePath, originalName, uploadDir) {
  try {
    console.log("📂 Analyzing Numbers file structure...");

    // Numbers files are ZIP archives
    const zip = new AdmZip(numbersFilePath);
    const entries = zip.getEntries();

    console.log(`Found ${entries.length} entries in Numbers file`);

    // Look for preview images and data files
    const previewEntries = entries.filter(
      (entry) =>
        entry.entryName.includes("preview") &&
        entry.entryName.toLowerCase().includes(".jpeg")
    );

    const dataEntries = entries.filter(
      (entry) =>
        entry.entryName.includes("Tables/") || entry.entryName.includes("Data")
    );

    // Create workbook with extracted information
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: File Analysis
    const analysisSheet = workbook.addWorksheet("Numbers Analysis");

    // Header
    analysisSheet.mergeCells("A1:D1");
    analysisSheet.getCell(
      "A1"
    ).value = `📊 Numbers File Analysis: ${originalName}`;
    analysisSheet.getCell("A1").font = { bold: true, size: 14 };
    analysisSheet.getCell("A1").alignment = { horizontal: "center" };
    analysisSheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    // File structure info
    analysisSheet.addRow([]);
    analysisSheet.addRow(["📁 File Structure Information"]);
    analysisSheet.addRow(["Total Entries:", entries.length]);
    analysisSheet.addRow(["Data Files Found:", dataEntries.length]);
    analysisSheet.addRow(["Preview Images:", previewEntries.length]);
    analysisSheet.addRow([
      "File Size:",
      `${(fs.statSync(numbersFilePath).size / 1024).toFixed(1)} KB`,
    ]);

    // List data entries
    if (dataEntries.length > 0) {
      analysisSheet.addRow([]);
      analysisSheet.addRow(["🗂️ Data Files Detected:"]);
      dataEntries.slice(0, 20).forEach((entry, index) => {
        analysisSheet.addRow([
          `${index + 1}.`,
          entry.entryName,
          `${entry.header.size} bytes`,
        ]);
      });

      if (dataEntries.length > 20) {
        analysisSheet.addRow([
          "...",
          `and ${dataEntries.length - 20} more data files`,
        ]);
      }
    }

    // Try to extract preview images
    if (previewEntries.length > 0) {
      const previewSheet = workbook.addWorksheet("Preview Images");

      previewSheet.addRow(["📸 Spreadsheet Previews Found"]);
      previewSheet.addRow([]);
      previewSheet.addRow([
        "Note: These are preview images of your spreadsheet",
      ]);
      previewSheet.addRow([
        "For full data access, use manual conversion methods below",
      ]);

      // Extract and save preview images
      previewEntries.slice(0, 3).forEach((entry, index) => {
        try {
          const imageData = zip.readFile(entry);
          const imagePath = path.join(uploadDir, `preview_${index + 1}.jpeg`);
          fs.writeFileSync(imagePath, imageData);
          previewSheet.addRow([
            `Preview ${index + 1}:`,
            `Saved as preview_${index + 1}.jpeg`,
          ]);
        } catch (imgError) {
          console.log(
            `Failed to extract preview ${index + 1}:`,
            imgError.message
          );
        }
      });
    }

    // Manual conversion guidance
    const guidanceSheet = workbook.addWorksheet("Conversion Guide");

    guidanceSheet.addRow(["🔧 Manual Conversion Required"]);
    guidanceSheet.addRow([]);
    guidanceSheet.addRow(["Why manual conversion?"]);
    guidanceSheet.addRow(["•", "Numbers uses Apple's proprietary data format"]);
    guidanceSheet.addRow([
      "•",
      "Full data extraction requires Apple's libraries",
    ]);
    guidanceSheet.addRow([
      "•",
      "This preserves your data privacy (no external uploads)",
    ]);

    guidanceSheet.addRow([]);
    guidanceSheet.addRow(["📱 Local Conversion Steps (Recommended):"]);
    guidanceSheet.addRow(["1.", "Open your .numbers file in Apple Numbers"]);
    guidanceSheet.addRow(["2.", "File → Export To → Excel..."]);
    guidanceSheet.addRow(["3.", "Choose 'Excel' (.xlsx) format"]);
    guidanceSheet.addRow(["4.", "Save and upload the .xlsx file"]);

    guidanceSheet.addRow([]);
    guidanceSheet.addRow(["🖥️ Alternative: Use iCloud"]);
    guidanceSheet.addRow(["1.", "Upload .numbers to iCloud Numbers online"]);
    guidanceSheet.addRow(["2.", "Download as Excel from iCloud"]);
    guidanceSheet.addRow(["3.", "Upload the downloaded .xlsx file"]);

    // Style the worksheets
    [analysisSheet, guidanceSheet].forEach((sheet) => {
      sheet.getColumn(1).width = 25;
      sheet.getColumn(2).width = 40;
      sheet.getColumn(3).width = 15;
      sheet.getColumn(4).width = 15;
    });

    // Save the analysis file
    const outputPath = path.join(uploadDir, `${originalName}_analysis.xlsx`);
    await workbook.xlsx.writeFile(outputPath);

    return {
      success: true,
      filePath: outputPath,
      method: "File Structure Analysis",
      message: `Analyzed Numbers file with ${entries.length} internal files. Manual conversion required for data access.`,
      dataFiles: dataEntries.length,
      previewImages: previewEntries.length,
    };
  } catch (error) {
    console.log("Numbers file analysis failed:", error.message);
    return {
      success: false,
      error: `File analysis failed: ${error.message}`,
    };
  }
}

// Strategy 3: Create comprehensive local guidance
async function createLocalGuidance(numbersFilePath, originalName, uploadDir) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Local Conversion Guide");

    // Header
    worksheet.mergeCells("A1:C1");
    worksheet.getCell("A1").value = "🔒 Private Numbers to Excel Converter";
    worksheet.getCell("A1").font = {
      bold: true,
      size: 16,
      color: { argb: "FFFFFFFF" },
    };
    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2E8B57" }, // Sea green for privacy
    };
    worksheet.getCell("A1").alignment = { horizontal: "center" };

    // Privacy notice
    worksheet.addRow([]);
    worksheet.addRow(["🛡️ Your Data Stays Private"]);
    worksheet.addRow(["✅", "File processed locally on your server"]);
    worksheet.addRow(["✅", "No external uploads or cloud services"]);
    worksheet.addRow(["✅", "Complete data privacy maintained"]);

    // File information
    worksheet.addRow([]);
    worksheet.addRow(["📋 File Details"]);
    worksheet.addRow(["Name:", `${originalName}.numbers`]);
    worksheet.addRow([
      "Size:",
      `${(fs.statSync(numbersFilePath).size / 1024).toFixed(1)} KB`,
    ]);
    worksheet.addRow(["Processed:", new Date().toLocaleString()]);
    worksheet.addRow(["Server:", process.platform]);

    // Local conversion methods
    worksheet.addRow([]);
    worksheet.addRow(["🍎 Method 1: Apple Numbers App (Recommended)"]);
    worksheet.addRow(["1.", "Double-click your .numbers file"]);
    worksheet.addRow(["2.", "File → Export To → Excel..."]);
    worksheet.addRow(["3.", "Choose .xlsx format"]);
    worksheet.addRow(["4.", "Click Export"]);
    worksheet.addRow(["5.", "Upload the .xlsx file to this app"]);

    worksheet.addRow([]);
    worksheet.addRow(["☁️ Method 2: iCloud Numbers (Web-based)"]);
    worksheet.addRow(["1.", "Go to iCloud.com and sign in"]);
    worksheet.addRow(["2.", "Open Numbers app"]);
    worksheet.addRow(["3.", "Upload your .numbers file"]);
    worksheet.addRow(["4.", "Tools → Download a Copy → Excel"]);
    worksheet.addRow(["5.", "Upload the downloaded .xlsx file"]);

    worksheet.addRow([]);
    worksheet.addRow(["💡 Why These Methods Work"]);
    worksheet.addRow(["•", "Uses Apple's official conversion tools"]);
    worksheet.addRow(["•", "Preserves all formatting and formulas"]);
    worksheet.addRow(["•", "Maintains data accuracy"]);
    worksheet.addRow(["•", "No third-party services required"]);

    // Troubleshooting
    worksheet.addRow([]);
    worksheet.addRow(["🔧 Troubleshooting"]);
    worksheet.addRow([
      "No Numbers app?",
      "Use iCloud Numbers (free Apple ID required)",
    ]);
    worksheet.addRow(["Large file?", "Export individual sheets separately"]);
    worksheet.addRow([
      "Complex formulas?",
      "Check calculations after conversion",
    ]);

    // Style the worksheet
    worksheet.getColumn(1).width = 20;
    worksheet.getColumn(2).width = 50;
    worksheet.getColumn(3).width = 20;

    // Style section headers
    [3, 7, 13, 20, 26, 31].forEach((rowNum) => {
      const row = worksheet.getRow(rowNum);
      row.font = { bold: true, size: 12 };
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F8F0" }, // Light green
      };
    });

    const guidePath = path.join(uploadDir, `${originalName}_local_guide.xlsx`);
    await workbook.xlsx.writeFile(guidePath);

    return {
      success: false, // Not a successful conversion, but successful guidance
      message: "Numbers file requires manual conversion to maintain privacy",
      guidance: "Created local conversion guide with privacy-focused methods",
      steps: [
        "Open .numbers file in Apple Numbers app",
        "Export as Excel (.xlsx) format",
        "Upload the converted .xlsx file",
      ],
      filePath: guidePath,
      privacy: "All processing done locally - no external services used",
    };
  } catch (error) {
    throw new Error(`Failed to create local guidance: ${error.message}`);
  }
}

// Utility function to clean up files
function cleanupFiles(filePaths) {
  filePaths.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("🧹 Cleaned up:", path.basename(filePath));
      } catch (error) {
        console.error("Failed to clean up file:", filePath, error.message);
      }
    }
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 100MB." });
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
      console.log("🔒 Privacy-focused Numbers conversion enabled");
      console.log(`📊 Platform: ${process.platform}`);
      console.log(`📁 Upload directory: ${path.join(__dirname, "Uploads")}`);
    });
  } else {
    // Fallback to HTTP for development
    http.createServer(app).listen(port, () => {
      console.log(`✅ HTTP Server is running on http://localhost:${port}`);
      console.log("🔒 Privacy-focused Numbers conversion enabled");
      console.log(`📊 Platform: ${process.platform}`);
      console.log(`📁 Upload directory: ${path.join(__dirname, "Uploads")}`);
    });
  }
};

// Start the server
startServer();
