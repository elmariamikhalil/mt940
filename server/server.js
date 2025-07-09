const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const http = require("http");
const https = require("https");
const fs = require("fs");
const multer = require("multer");
const ExcelJS = require("exceljs");
const AdmZip = require("adm-zip");
const { execSync } = require("child_process");

// ============================================================================
// APP SETUP & MIDDLEWARE
// ============================================================================

const app = express();
app.use(cors());
const port = process.env.PORT || 5002;

// Middleware
app.use(bodyParser.json());
app.use("/Uploads", express.static(path.join(__dirname, "Uploads")));

// ============================================================================
// MULTER CONFIGURATION
// ============================================================================

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
    fileSize: 100 * 1024 * 1024, // 100MB for large Numbers files
  },
});

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let latestTransactions = [];

// ============================================================================
// MT940 PARSING FUNCTIONS
// ============================================================================

/**
 * Clean account number to extract IBAN properly
 */
function cleanAccountNumber(accountNumber) {
  console.log("Raw account number:", accountNumber);

  let cleaned = accountNumber.trim();
  const parts = cleaned.split(/[\/\s,;:\-]+/);

  for (let part of parts) {
    part = part.trim();
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(part)) {
      console.log("Found IBAN:", part.toUpperCase());
      return part.toUpperCase();
    }
  }

  const currencyRegex = /^(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD|ZAR)/i;
  cleaned = cleaned.replace(currencyRegex, "").trim();
  cleaned = cleaned
    .replace(/(EUR|USD|GBP|CHF|JPY|AUD|CAD|NOK|SEK|DKK|NZD|ZAR)$/i, "")
    .trim();

  if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(cleaned)) {
    console.log("Found IBAN after currency removal:", cleaned.toUpperCase());
    return cleaned.toUpperCase();
  }

  const fallback = parts.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    ""
  );

  console.log("Using fallback account number:", fallback);
  return fallback.trim();
}

/**
 * Parse MT940 file content
 */
function parseMT940(content) {
  const transactions = [];
  const lines = content.split(/\r?\n/);

  let currentAccountNumber = "";
  let currentTransaction = null;
  let descriptionLines = [];

  console.log(`Processing ${lines.length} lines`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith(":25:")) {
      const rawAccountNumber = line.substring(4).trim();
      currentAccountNumber = cleanAccountNumber(rawAccountNumber);
      console.log("Set account number:", currentAccountNumber);
    } else if (line.startsWith(":61:")) {
      if (currentTransaction) {
        if (descriptionLines.length > 0) {
          currentTransaction.description = buildDescription(descriptionLines);
        }
        transactions.push(currentTransaction);
      }

      currentTransaction = parseTransactionLine(line, currentAccountNumber);
      descriptionLines = [];
      console.log("Parsed transaction:", currentTransaction);
    } else if (line.startsWith(":86:")) {
      if (currentTransaction) {
        descriptionLines.push(line.substring(4).trim());
      }
    } else if (
      currentTransaction &&
      descriptionLines.length > 0 &&
      !line.startsWith(":") &&
      line.length > 0
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

  console.log(`Parsed ${transactions.length} transactions`);
  return transactions;
}

/**
 * Parse transaction line (:61:)
 */
function parseTransactionLine(line, accountNumber) {
  const txData = line.substring(4).trim();
  console.log("Parsing transaction line:", txData);

  const yymmdd = txData.substring(0, 6);
  const year = parseInt(yymmdd.substring(0, 2));
  const fullYear = year <= 30 ? 2000 + year : 1900 + year;
  const month = yymmdd.substring(2, 4);
  const day = yymmdd.substring(4, 6);

  const isoDate = `${fullYear}-${month}-${day}`;
  const displayDate = `${day}-${month}-${fullYear}`;

  let remainingData = txData.substring(6);

  if (remainingData.length >= 4 && /^\d{4}/.test(remainingData)) {
    remainingData = remainingData.substring(4);
  }

  let cdIndicator = "C";
  if (remainingData.length > 0 && /^[DC]/.test(remainingData)) {
    cdIndicator = remainingData.charAt(0);
    remainingData = remainingData.substring(1);
  }

  let amountStr = "0.00";
  const amountPatterns = [
    /^([A-Z]{3})?(\d+[,.]?\d*)/,
    /^([A-Z]{3})(\d+[,.]?\d*)/,
    /^(\d+[,.]?\d*)/,
  ];

  for (const pattern of amountPatterns) {
    const match = remainingData.match(pattern);
    if (match) {
      amountStr = match[2] || match[1];
      if (amountStr && /^\d/.test(amountStr)) {
        break;
      }
    }
  }

  amountStr = amountStr.replace(/[^\d.,]/g, "");
  amountStr = amountStr.replace(/,/g, ".");

  if (!/^\d+\.?\d*$/.test(amountStr)) {
    console.warn("Invalid amount format, using 0.00:", amountStr);
    amountStr = "0.00";
  }

  const amount = parseFloat(amountStr) || 0.0;
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
    rawAmount: amount,
  };
}

/**
 * Build description from lines
 */
function buildDescription(lines) {
  if (!lines || lines.length === 0) return "";

  const fullText = lines.join(" ");
  return fullText
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/"/g, '""');
}

/**
 * Format transactions as CSV
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

// ============================================================================
// NUMBERS CONVERSION FUNCTIONS
// ============================================================================

/**
 * Enhanced conversion function with actual data extraction
 */
async function convertNumbersWithDataExtraction(numbersFilePath, originalName) {
  const uploadDir = path.join(__dirname, "Uploads");

  console.log("🔍 Starting enhanced Numbers conversion...");

  // Strategy 1: macOS AppleScript (most reliable)
  if (process.platform === "darwin") {
    try {
      const result = await convertWithAppleScript(
        numbersFilePath,
        originalName,
        uploadDir
      );
      if (result.success) {
        return result;
      }
      console.log("⚠️ AppleScript failed, trying data extraction...");
    } catch (error) {
      console.log("❌ AppleScript conversion failed:", error.message);
    }
  }

  // Strategy 2: Enhanced ZIP data extraction
  try {
    const result = await extractAndConvertNumbersData(
      numbersFilePath,
      originalName,
      uploadDir
    );
    if (result.success) {
      return result;
    }
  } catch (error) {
    console.log("❌ Data extraction failed:", error.message);
  }

  // Strategy 3: Python numbers-parser
  try {
    const result = await convertWithPython(
      numbersFilePath,
      originalName,
      uploadDir
    );
    if (result.success) {
      return result;
    }
  } catch (error) {
    console.log("❌ Python conversion failed:", error.message);
  }

  return {
    success: false,
    error:
      "Unable to extract data from Numbers file. All conversion methods failed.",
    methods_tried: ["AppleScript", "ZIP extraction", "Python parser"],
  };
}

/**
 * Strategy 1: AppleScript conversion (macOS only)
 */
async function convertWithAppleScript(
  numbersFilePath,
  originalName,
  uploadDir
) {
  try {
    console.log("🍎 Attempting AppleScript conversion...");

    execSync('osascript -e "tell application \\"Numbers\\" to version"', {
      timeout: 5000,
      stdio: "pipe",
    });

    const outputPath = path.join(uploadDir, `${originalName}_converted.xlsx`);

    const appleScript = `
      on run
        try
          tell application "Numbers"
            set theDoc to open POSIX file "${numbersFilePath}"
            delay 2
            export theDoc to file "${outputPath}" as Microsoft Excel
            close theDoc
            return "success"
          end tell
        on error errMsg
          return "error: " & errMsg
        end try
      end run
    `;

    const result = execSync(`osascript -e '${appleScript}'`, {
      timeout: 120000,
      encoding: "utf8",
    }).trim();

    if (result.includes("error:")) {
      throw new Error(result);
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return {
        success: true,
        filePath: outputPath,
        method: "AppleScript Native Conversion",
        fileSize: fs.statSync(outputPath).size,
      };
    } else {
      throw new Error("Output file not created or empty");
    }
  } catch (error) {
    return {
      success: false,
      error: `AppleScript conversion failed: ${error.message}`,
    };
  }
}

/**
 * Strategy 2: Enhanced ZIP data extraction
 */
async function extractAndConvertNumbersData(
  numbersFilePath,
  originalName,
  uploadDir
) {
  try {
    console.log("📦 Extracting data from Numbers ZIP structure...");

    const zip = new AdmZip(numbersFilePath);
    const entries = zip.getEntries();

    console.log(`Found ${entries.length} entries in Numbers file`);

    const tableFiles = entries.filter(
      (entry) =>
        entry.entryName.includes("Tables/") &&
        (entry.entryName.includes("Tile-") ||
          entry.entryName.includes("DataList-"))
    );

    const documentFiles = entries.filter(
      (entry) =>
        entry.entryName.includes("Document.iwa") ||
        entry.entryName.includes("CalculationEngine.iwa")
    );

    console.log(
      `Found ${tableFiles.length} table files and ${documentFiles.length} document files`
    );

    if (tableFiles.length === 0) {
      throw new Error("No table data files found in Numbers archive");
    }

    const extractedData = await parseNumbersTableData(
      zip,
      tableFiles,
      documentFiles
    );

    if (extractedData.tables.length === 0) {
      throw new Error("No readable table data found");
    }

    const workbook = new ExcelJS.Workbook();

    // Add metadata sheet
    const metaSheet = workbook.addWorksheet("Conversion Info");
    metaSheet.addRow(["Numbers File Conversion"]);
    metaSheet.addRow(["Original File:", `${originalName}.numbers`]);
    metaSheet.addRow(["Converted:", new Date().toLocaleString()]);
    metaSheet.addRow(["Tables Found:", extractedData.tables.length]);
    metaSheet.addRow(["Method:", "ZIP Data Extraction"]);

    // Add each extracted table as a separate worksheet
    extractedData.tables.forEach((table, index) => {
      const sheetName = table.name || `Table ${index + 1}`;
      const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));

      if (table.headers && table.headers.length > 0) {
        worksheet.addRow(table.headers);
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6E6FA" },
        };
      }

      table.data.forEach((row) => {
        worksheet.addRow(row);
      });

      worksheet.columns.forEach((column) => {
        if (column.values && column.values.length > 0) {
          const maxLength = Math.max(
            ...column.values.map((value) =>
              value ? value.toString().length : 0
            )
          );
          column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        }
      });
    });

    const outputPath = path.join(uploadDir, `${originalName}_extracted.xlsx`);
    await workbook.xlsx.writeFile(outputPath);

    return {
      success: true,
      filePath: outputPath,
      method: "ZIP Data Extraction",
      tablesExtracted: extractedData.tables.length,
      fileSize: fs.statSync(outputPath).size,
    };
  } catch (error) {
    return {
      success: false,
      error: `Data extraction failed: ${error.message}`,
    };
  }
}

/**
 * Parse Numbers table data from IWA files
 */
async function parseNumbersTableData(zip, tableFiles, documentFiles) {
  const tables = [];

  try {
    for (const tableFile of tableFiles.slice(0, 10)) {
      try {
        const tableData = zip.readFile(tableFile);

        if (!tableData || tableData.length === 0) continue;

        const tableText = tableData.toString("utf8");
        const lines = tableText.split("\n").filter((line) => line.trim());
        const dataRows = [];

        for (const line of lines) {
          const values = extractValuesFromLine(line);
          if (values.length > 0) {
            dataRows.push(values);
          }
        }

        if (dataRows.length > 0) {
          const hasHeaders = dataRows[0].some(
            (cell) =>
              typeof cell === "string" && cell.length > 0 && !isNumeric(cell)
          );

          const table = {
            name: tableFile.entryName.split("/").pop().replace(".iwa", ""),
            headers: hasHeaders ? dataRows[0] : null,
            data: hasHeaders ? dataRows.slice(1) : dataRows,
          };

          tables.push(table);
          console.log(
            `✓ Extracted table: ${table.name} (${table.data.length} rows)`
          );
        }
      } catch (fileError) {
        console.log(
          `⚠️ Could not parse ${tableFile.entryName}:`,
          fileError.message
        );
        continue;
      }
    }

    if (tables.length === 0) {
      console.log("🔍 No structured data found, trying text extraction...");
      const textTable = await extractTextBasedData(zip, tableFiles);
      if (textTable) {
        tables.push(textTable);
      }
    }
  } catch (error) {
    console.log("❌ Error parsing table data:", error.message);
  }

  return { tables };
}

/**
 * Extract values from a line of text
 */
function extractValuesFromLine(line) {
  const values = [];

  const patterns = [
    /\b\d+\.?\d*\b/g,
    /"([^"]+)"/g,
    /\b[A-Za-z][A-Za-z0-9\s]+\b/g,
  ];

  for (const pattern of patterns) {
    const matches = line.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const cleaned = match.replace(/"/g, "").trim();
        if (cleaned.length > 0 && !values.includes(cleaned)) {
          values.push(isNumeric(cleaned) ? parseFloat(cleaned) : cleaned);
        }
      });
    }
  }

  return values.slice(0, 20);
}

/**
 * Extract text-based data as fallback
 */
async function extractTextBasedData(zip, tableFiles) {
  const allText = [];

  for (const file of tableFiles.slice(0, 5)) {
    try {
      const data = zip.readFile(file);
      const text = data.toString("utf8");

      const readableContent = text
        .replace(/[^\x20-\x7E\n]/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 2)
        .slice(0, 50);

      allText.push(...readableContent);
    } catch (error) {
      continue;
    }
  }

  if (allText.length > 0) {
    const dataRows = allText
      .map((line) => extractValuesFromLine(line))
      .filter((row) => row.length > 0)
      .slice(0, 100);

    if (dataRows.length > 0) {
      return {
        name: "Extracted Data",
        headers: ["Content", "Type", "Value"],
        data: dataRows.map((row, index) => [
          row.join(" | "),
          typeof row[0],
          row.length,
        ]),
      };
    }
  }

  return null;
}

/**
 * Strategy 3: Python conversion using numbers-parser
 */
async function convertWithPython(numbersFilePath, originalName, uploadDir) {
  try {
    console.log("🐍 Attempting Python conversion...");

    execSync('python3 -c "import numbers_parser; print(\\"available\\")"', {
      timeout: 5000,
      stdio: "pipe",
    });

    const outputPath = path.join(uploadDir, `${originalName}_python.xlsx`);

    const pythonScript = `
import sys
import numbers_parser
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

def convert_numbers_to_excel(numbers_path, excel_path):
    try:
        doc = numbers_parser.Document(numbers_path)
        wb = Workbook()
        wb.remove(wb.active)
        
        sheet_count = 0
        for sheet_name, sheet in doc.sheets.items():
            ws = wb.create_sheet(title=sheet_name[:31])
            sheet_count += 1
            
            for table_idx, table in enumerate(sheet.tables):
                rows_data = list(table.rows())
                if not rows_data:
                    continue
                
                start_row = 1 if table_idx == 0 else ws.max_row + 2
                
                for row_idx, row_data in enumerate(rows_data):
                    excel_row = start_row + row_idx
                    for col_idx, cell_value in enumerate(row_data):
                        if cell_value is not None:
                            ws.cell(row=excel_row, column=col_idx + 1, value=cell_value)
        
        wb.save(excel_path)
        print(f"Success: {sheet_count} sheets converted")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    success = convert_numbers_to_excel("${numbersFilePath}", "${outputPath}")
    sys.exit(0 if success else 1)
`;

    const scriptPath = path.join(uploadDir, "convert_numbers.py");
    fs.writeFileSync(scriptPath, pythonScript);

    const result = execSync(`python3 "${scriptPath}"`, {
      timeout: 120000,
      encoding: "utf8",
    });

    console.log("Python output:", result);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      fs.unlinkSync(scriptPath);
      return {
        success: true,
        filePath: outputPath,
        method: "Python numbers-parser",
        fileSize: fs.statSync(outputPath).size,
      };
    } else {
      throw new Error("Python conversion produced no output");
    }
  } catch (error) {
    return {
      success: false,
      error: `Python conversion failed: ${error.message}`,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isNumeric(str) {
  return !isNaN(str) && !isNaN(parseFloat(str));
}

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

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Privacy status
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

// MT940 Conversion
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

// Numbers to Excel Conversion
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

    const conversionResult = await convertNumbersWithDataExtraction(
      numbersFilePath,
      originalName
    );

    if (conversionResult.success) {
      console.log(`✅ Successfully converted: ${conversionResult.method}`);

      res.download(conversionResult.filePath, `${originalName}.xlsx`, (err) => {
        if (err) {
          console.error("Error downloading file:", err);
          res.status(500).json({ error: "Error downloading converted file" });
        } else {
          console.log("📁 File downloaded successfully");
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

// Download CSV
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

// Download Excel
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
      { header: "Account Number", key: "accountNumber", width: 25 },
      { header: "Date (YYMMDD)", key: "yymmdd", width: 15 },
      { header: "Date (ISO)", key: "isoDate", width: 15 },
      { header: "Date (Display)", key: "displayDate", width: 15 },
      { header: "Amount (Dot)", key: "amountDot", width: 15 },
      { header: "Amount (Comma)", key: "amountComma", width: 15 },
      { header: "C/D", key: "cdIndicator", width: 5 },
      { header: "Description", key: "description", width: 70 },
    ];

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

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

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

// ============================================================================
// SERVER STARTUP
// ============================================================================

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
      console.log("🎯 Features available:");
      console.log("   • MT940/STA/FIN file parsing");
      console.log("   • Numbers file conversion (3 strategies)");
      console.log("   • CSV/Excel export");
      console.log("   • Local data processing only");
    });
  } else {
    // Fallback to HTTP for development
    http.createServer(app).listen(port, () => {
      console.log(`✅ HTTP Server is running on http://localhost:${port}`);
      console.log("🔒 Privacy-focused Numbers conversion enabled");
      console.log(`📊 Platform: ${process.platform}`);
      console.log(`📁 Upload directory: ${path.join(__dirname, "Uploads")}`);
      console.log("🎯 Features available:");
      console.log("   • MT940/STA/FIN file parsing");
      console.log("   • Numbers file conversion (3 strategies)");
      console.log("   • CSV/Excel export");
      console.log("   • Local data processing only");
    });
  }
};

// Start the server
startServer();
