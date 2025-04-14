// server.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const routes = require("./routes/routes"); // Adjust path if needed
const cors = require("cors"); // Import cors package

const app = express();
app.use(cors());

const port = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(bodyParser.json());

// Serve static files (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Use the routes for handling MT940 conversion
app.use("/api", routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
