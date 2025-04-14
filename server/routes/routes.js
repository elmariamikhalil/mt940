const express = require("express");
const multer = require("multer");
const convertController = require("../controllers/convertController");

const router = express.Router();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

// Route to handle MT940 file conversion
router.post(
  "/convert",
  upload.single("mt940File"),
  convertController.handleConvert
);

// Route to download the transactions as CSV
router.get("/download/csv", convertController.downloadCSV);

module.exports = router;
