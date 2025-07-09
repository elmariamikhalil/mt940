import { useState } from "react";
import {
  CContainer,
  CNav,
  CNavItem,
  CNavLink,
  CCard,
  CCardBody,
  CButton,
  CRow,
  CCol,
  CAlert,
  CFormInput,
  CFormTextarea,
} from "@coreui/react";
import FileUpload from "./components/FileUpload";
import TransactionsTable from "./components/TransactionsTable";
import Header from "./components/Header";
import Footer from "./components/Footer";
import DashboardStats from "./components/DashboardStats";
import apiService from "./api";
import "@coreui/coreui/dist/css/coreui.min.css";
import "./App.css";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [numbersData, setNumbersData] = useState("");
  const [numbersFile, setNumbersFile] = useState(null);

  // Download file function for CSV and Excel
  const downloadFile = async (type) => {
    setErrorMessage("");
    try {
      let downloadPromise;
      let filename;

      if (type === "csv") {
        downloadPromise = apiService.downloadCSV();
        filename = "transactions.csv";
      } else if (type === "excel") {
        downloadPromise = apiService.downloadExcel();
        filename = "statement.xlsx";
      } else {
        throw new Error("Invalid download type");
      }

      const response = await downloadPromise;

      if (!response || response.status !== 200) {
        let errorText = "Unknown error";
        if (response.data && !(response.data instanceof Blob)) {
          errorText = response.data.error || JSON.stringify(response.data);
        }
        throw new Error(
          `Failed to download ${type.toUpperCase()}: Status ${
            response.status || "N/A"
          } - ${errorText}`
        );
      }

      const blob = response.data;
      if (!(blob instanceof Blob)) {
        throw new Error(
          `Failed to download ${type.toUpperCase()}: Response data is not a valid file.`
        );
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download error:", error);
      let message = error.message || `Failed to download ${type.toUpperCase()}`;
      if (error.status === 400) {
        message = `Failed to download ${type.toUpperCase()}: No transactions available. Please upload an MT940 or FIN file first.`;
      } else if (error.status === 404) {
        message = `Failed to download ${type.toUpperCase()}: Endpoint not found. Please contact support.`;
      } else if (
        error.message.includes("Network") ||
        error.message.includes("N/A")
      ) {
        message +=
          " (Connection issue. Please check if the server is running or contact support.)";
      }
      setErrorMessage(message);
    }
  };

  // Handle successful MT940 upload
  const handleUploadComplete = (data) => {
    console.log("Uploaded transactions from API:", data);
    setTransactions(data);
    setActiveTab("results");
    setIsLoading(false);
    setErrorMessage("");
  };

  // Updated Numbers to Excel handler
  const handleNumbersToExcel = async () => {
    setErrorMessage("");
    setIsLoading(true);

    try {
      // Validate input
      if (!numbersFile) {
        throw new Error("Please upload a .numbers file.");
      }

      // Validate file extension
      if (!numbersFile.name.toLowerCase().endsWith(".numbers")) {
        throw new Error(
          "Please upload a valid .numbers file from Apple Numbers."
        );
      }

      // Prepare form data
      const formData = new FormData();
      formData.append("file", numbersFile);
      console.log("Uploading .numbers file:", numbersFile.name);

      // Make API call
      const response = await apiService.convertNumbersToXlsx(formData);

      // Validate response
      if (!response || response.status !== 200) {
        let errorText = "Unknown error";
        if (response && response.data && !(response.data instanceof Blob)) {
          errorText = response.data.error || JSON.stringify(response.data);
        }
        throw new Error(`Failed to convert .numbers file: ${errorText}`);
      }

      // Validate blob
      const blob = response.data;
      if (!(blob instanceof Blob)) {
        throw new Error("Invalid response format. Expected file data.");
      }

      // Download converted file
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;

      // Use original filename but change extension
      const originalName = numbersFile.name;
      const nameWithoutExt = originalName.substring(
        0,
        originalName.lastIndexOf(".")
      );
      link.download = `${nameWithoutExt}.xlsx`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      // Success feedback
      console.log("Numbers file converted to Excel successfully");

      // Clear form after successful conversion
      setNumbersFile(null);
    } catch (error) {
      console.error("Error converting Numbers to Excel:", error);
      setErrorMessage(`Failed to convert .numbers file: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Updated file change handler for .numbers files
  const handleNumbersFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validate file extension
      if (!file.name.toLowerCase().endsWith(".numbers")) {
        setErrorMessage("Please upload a .numbers file from Apple Numbers.");
        return;
      }

      // Validate file size (50MB limit for Numbers files)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        setErrorMessage("File too large. Maximum size is 50MB.");
        return;
      }

      setNumbersFile(file);
      setErrorMessage(""); // Clear any previous errors
      console.log(
        "Numbers file selected:",
        file.name,
        "Size:",
        file.size,
        "bytes"
      );
    }
  };

  // Input validation helper
  const validateNumbersInput = (data) => {
    if (!data || !data.trim()) {
      return "Please enter some numbers or upload a file.";
    }

    const lines = data.trim().split(/\r?\n/);
    if (lines.length === 0) {
      return "No valid data found.";
    }

    // Check if at least some lines contain numbers
    const hasValidData = lines.some((line) => {
      const cleanLine = line.trim();
      return (
        cleanLine.length > 0 &&
        (/\d/.test(cleanLine) || // Contains at least one digit
          /[a-zA-Z]/.test(cleanLine)) // Or contains letters (could be headers)
      );
    });

    if (!hasValidData) {
      return "No valid numbers or text found in the input.";
    }

    return null; // Valid
  };

  // Updated Numbers Tab Content Component
  const NumbersTabContent = () => (
    <>
      <div className="text-center mb-4 app-upload-header">
        <h2>Apple Numbers to Excel Converter</h2>
        <p className="text-medium-emphasis">
          Convert Apple Numbers files (.numbers) to Microsoft Excel format
          (.xlsx)
          <br />
          <small>
            <strong>Upload:</strong> .numbers files from Apple Numbers (macOS)
            <br />
            <strong>Output:</strong> .xlsx files compatible with Excel, Google
            Sheets, and other spreadsheet apps
            <br />
            <strong>Note:</strong> Best results when run on macOS with Numbers
            app installed
          </small>
        </p>
      </div>

      {errorMessage && (
        <CAlert color="danger" className="mt-3">
          {errorMessage}
        </CAlert>
      )}

      <div className="mb-3">
        <CFormInput
          type="file"
          accept=".numbers"
          onChange={handleNumbersFileChange}
          label="Upload Apple Numbers File (.numbers)"
          className="mb-3"
        />

        {numbersFile && (
          <div className="alert alert-info">
            <strong>Selected File:</strong> {numbersFile.name} (
            {(numbersFile.size / 1024).toFixed(1)} KB)
            <br />
            <small>
              Will be converted to:{" "}
              {numbersFile.name.replace(".numbers", ".xlsx")}
            </small>
          </div>
        )}

        <div className="alert alert-warning">
          <strong>⚠️ Important Notes:</strong>
          <ul className="mb-0 mt-2">
            <li>
              This converter works best on macOS with Apple Numbers installed
            </li>
            <li>Some formatting and advanced features may not be preserved</li>
            <li>
              For best results, consider exporting directly from Numbers app
            </li>
            <li>Large files may take longer to process</li>
          </ul>
        </div>
      </div>

      <CRow className="mt-4 text-center justify-content-center app-buttons-row">
        <CCol xs="auto">
          <CButton
            color="primary"
            variant="outline"
            onClick={handleNumbersToExcel}
            disabled={isLoading || !numbersFile}
            size="lg"
          >
            {isLoading ? "Converting..." : "Convert to Excel"}
          </CButton>
        </CCol>
      </CRow>

      <div className="mt-4 text-center">
        <small className="text-muted">
          <strong>Conversion Process:</strong> .numbers → .xlsx
          <br />
          🍎 Apple Numbers → 📊 Microsoft Excel → 🌐 Universal compatibility
        </small>
      </div>
    </>
  );

  return (
    <div className="app-container min-vh-100 d-flex flex-column">
      <Header />
      <CContainer className="flex-grow-1 py-4 app-content">
        <CCard className="app-card">
          <CNav variant="tabs" className="mt-1 mx-1 app-nav">
            <CNavItem>
              <CNavLink
                active={activeTab === "upload"}
                onClick={() => setActiveTab("upload")}
                className="cursor-pointer"
              >
                Upload MT940/FIN
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink
                active={activeTab === "results"}
                onClick={() => setActiveTab("results")}
                disabled={transactions.length === 0}
                className="cursor-pointer"
              >
                Results
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink
                active={activeTab === "numbers"}
                onClick={() => setActiveTab("numbers")}
                className="cursor-pointer"
              >
                Numbers to Excel
              </CNavLink>
            </CNavItem>
          </CNav>

          <CCardBody className="app-card-body">
            {activeTab === "upload" ? (
              <>
                <div className="text-center mb-4 app-upload-header">
                  <h2>MT940/FIN File Converter</h2>
                  <p className="text-medium-emphasis">
                    Upload your MT940 or FIN file and convert it to CSV or Excel
                    format.
                  </p>
                </div>
                <FileUpload
                  setIsLoading={setIsLoading}
                  isLoading={isLoading}
                  onUploadComplete={handleUploadComplete}
                />
              </>
            ) : activeTab === "results" ? (
              <>
                {transactions.length > 0 && (
                  <>
                    <DashboardStats transactions={transactions} />
                    <TransactionsTable transactions={transactions} />
                    {errorMessage && (
                      <CAlert color="danger" className="mt-3">
                        {errorMessage}
                      </CAlert>
                    )}
                    <CRow className="mt-4 text-center justify-content-center app-buttons-row">
                      <CCol xs="auto">
                        <CButton
                          color="success"
                          variant="outline"
                          onClick={() => downloadFile("csv")}
                          disabled={transactions.length === 0}
                        >
                          Download CSV
                        </CButton>
                      </CCol>
                      <CCol xs="auto">
                        <CButton
                          color="primary"
                          variant="outline"
                          onClick={() => downloadFile("excel")}
                          disabled={transactions.length === 0}
                        >
                          Download Excel
                        </CButton>
                      </CCol>
                      <CCol xs="auto">
                        <CButton
                          color="dark"
                          onClick={() => setActiveTab("upload")}
                        >
                          Upload New File
                        </CButton>
                      </CCol>
                    </CRow>
                  </>
                )}
              </>
            ) : (
              <NumbersTabContent />
            )}
          </CCardBody>
        </CCard>
      </CContainer>
      <Footer />
    </div>
  );
}

export default App;
