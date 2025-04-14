const express = require("express");
const multer = require("multer");
const {
  handleConvert,
  downloadCSV,
  downloadExcel,
} = require("../controllers/convertController");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), handleConvert);
router.get("/download/csv", downloadCSV);
router.get("/download/excel", downloadExcel);

module.exports = router;
