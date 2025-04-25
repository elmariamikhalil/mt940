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

// Import routes if they exist, otherwise define them directly
let routes;
try {
  routes = require("./routes/routes");
  app.use("/api", routes);
  console.log("Routes loaded from ./routes/routes.js");
} catch (error) {
  console.error(
    "Could not load routes from ./routes/routes.js:",
    error.message || error
  );
  // Define routes directly as fallback
}

// MT940 Conversion Endpoint (fallback if not in routes.js)
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const fileContent = fs.readFileSync(req.file.path, { encoding: "utf8" });
    const transactions = parseMT940(fileContent); // Implement or import parseMT940 as needed
    latestTransactions = transactions;
    const displayTransactions = transactions.map((tx) => ({
      date: tx.displayDate.replace(/"/g, ""),
      amount:
        tx.cdIndicator === "D" ? -parseFloat(tx.amount) : parseFloat(tx.amount),
      description: tx.description,
    }));
    res.json({ transactions: displayTransactions });
  } catch (error) {
    console.error(
      "Error parsing MT940 file:",
      error.message || error.toString()
    );
    res.status(500).json({ error: "Error parsing MT940 file" });
  }
});

// Download CSV Endpoint (fallback if not in routes.js)
app.get("/api/download/csv", (req, res) => {
  if (latestTransactions.length === 0) {
    return res.status(400).json({
      error:
        "No transactions available for download. Please upload and process an MT940 file first.",
    });
  }
  try {
    const csv = formatMasterbalanceCSV(latestTransactions); // Implement or import formatMasterbalanceCSV as needed
    res.header("Content-Type", "text/csv");
    res.attachment("transactions.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error generating CSV:", error.message || error.toString());
    res.status(500).json({ error: "Error generating CSV" });
  }
});

// Download Excel Endpoint (fallback if not in routes.js)
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
        accountNumber: tx.accountNumber,
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
        console.error(
          "Error during file download:",
          err.message || err.toString()
        );
        res.status(500).json({ error: "Error downloading the file" });
      }
    });
  } catch (error) {
    console.error(
      "Error generating Excel file:",
      error.message || error.toString()
    );
    res.status(500).json({ error: "Error generating Excel file" });
  }
});

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
