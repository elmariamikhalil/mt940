const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const routes = require("./routes/routes");
const cors = require("cors");
const https = require("https");
const fs = require("fs");

const app = express();
app.use(cors());

const port = process.env.PORT || 5002;

// Middleware to parse JSON
app.use(bodyParser.json());

// Serve static files (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Use the routes for handling MT940 conversion
app.use("/api", routes);

// ✅ Use axoplan SSL cert (valid for all subdomains like mt940.axoplan.com)
const options = {
  cert: fs.readFileSync("/etc/letsencrypt/live/axoplan.com/fullchain.pem"),
  key: fs.readFileSync("/etc/letsencrypt/live/axoplan.com/privkey.pem"),
};

// Start HTTPS server
https.createServer(options, app).listen(port, () => {
  console.log(`✅ Server is running on https://mt940.axoplan.com:${port}`);
});
