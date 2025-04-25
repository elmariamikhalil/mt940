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

// MT940 Conversion Endpoint - Define both /api/convert and /convert
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    const transactions = parseMT940(fileContent);
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate || "01-01-2023",
      amount:
        tx.cdIndicator === "D"
          ? -parseFloat(tx.amount || 0)
          : parseFloat(tx.amount || 0),
      description: tx.description || "No description",
    }));
    res.json({ transactions: displayTransactions });
  } catch (error) {
    console.error("Error parsing MT940 file:", error.message || error);
    res.status(500).json({ error: "Error parsing MT940 file" });
  }
});

// Also define /convert for compatibility
app.post("/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    const transactions = parseMT940(fileContent);
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate || "01-01-2023",
      amount:
        tx.cdIndicator === "D"
          ? -parseFloat(tx.amount || 0)
          : parseFloat(tx.amount || 0),
      description: tx.description || "No description",
    }));
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

// Placeholder for parseMT940 (minimal implementation)
function parseMT940(content) {
  console.log("Parsing MT940 content (placeholder)");
  return [
    {
      accountNumber: "TEST123456789",
      shortValueDate: "231001",
      isoValueDate: "2023-10-01",
      displayDate: "01-10-2023",
      amount: "100.00",
      amountComma: "100,00",
      cdIndicator: "C",
      description: "Test Transaction",
    },
  ];
}

// Placeholder for formatMasterbalanceCSV (minimal implementation)
function formatMasterbalanceCSV(transactions) {
  console.log("Formatting CSV (placeholder)");
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
