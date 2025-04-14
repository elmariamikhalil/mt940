const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const routes = require("./routes/routes"); // Adjust path if needed
const cors = require("cors"); // Import cors package
const https = require("https");
const fs = require("fs");

const app = express();
app.use(cors());

const port = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(bodyParser.json());

// Serve static files (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Use the routes for handling MT940 conversion
app.use("/api", routes);

// SSL Certificate paths
const options = {
  cert: fs.readFileSync("/etc/letsencrypt/live/graphtsy.org/fullchain.pem"),
  key: fs.readFileSync("/etc/letsencrypt/live/graphtsy.org/privkey.pem"), // Replace with your SSL cert path
};

// Use https.createServer instead of app.listen to serve over HTTPS
https.createServer(options, app).listen(port, () => {
  console.log(`Server is running on https://localhost:${port}`);
});
