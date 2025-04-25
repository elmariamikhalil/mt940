import { useState } from "react";
import {
  CContainer,
  CButton,
  CRow,
  CCol,
  CAlert,
  CFormInput,
  CFormTextarea,
  CCard,
  CCardBody,
} from "@coreui/react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  useNavigate,
} from "react-router-dom";
import FileUpload from "./components/FileUpload";
import TransactionsTable from "./components/TransactionsTable";
import Header from "./components/Header";
import Footer from "./components/Footer";
import DashboardStats from "./components/DashboardStats";
import apiService from "./api";
import "@coreui/coreui/dist/css/coreui.min.css";
import "./App.css";

// Main App Component with Routing
function App() {
  return (
    <Router>
      <div className="app-container min-vh-100 d-flex flex-column">
        <Header />
        <CContainer className="flex-grow-1 py-4 app-content">
          <Routes>
            <Route path="/" element={<MT940Converter />} />
            <Route path="/numbers" element={<NumbersToXlsx />} />
          </Routes>
        </CContainer>
        <Footer />
      </div>
    </Router>
  );
}

// MT940 Converter Component (Original Functionality)
function MT940Converter() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const downloadFile = async (type) => {
    setErrorMessage(""); // Clear any previous errors
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
        message = `Failed to download ${type.toUpperCase()}: No transactions available. Please upload an MT940 file first.`;
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

  const handleUploadComplete = (data) => {
    setTransactions(data);
    setIsLoading(false);
    setErrorMessage(""); // Clear any errors on successful upload
  };

  return (
    <CCard className="app-card">
      <CCardBody>
        <div className="text-center mb-4 app-upload-header">
          <h2>MT940 File Converter</h2>
          <p className="text-medium-emphasis">
            Upload your MT940 file and convert it to CSV or Excel format.
          </p>
        </div>
        {errorMessage && (
          <CAlert color="danger" className="mt-3">
            {errorMessage}
          </CAlert>
        )}
        <FileUpload
          setIsLoading={setIsLoading}
          isLoading={isLoading}
          onUploadComplete={handleUploadComplete}
        />
        {transactions.length > 0 && (
          <>
            <DashboardStats transactions={transactions} />
            <TransactionsTable transactions={transactions} />
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
                <Link to="/numbers" className="btn btn-dark">
                  Convert Numbers to XLSX
                </Link>
              </CCol>
            </CRow>
          </>
        )}
      </CCardBody>
    </CCard>
  );
}

// Numbers to XLSX Converter Component (New Page)
function NumbersToXlsx() {
  const [numbersData, setNumbersData] = useState("");
  const [numbersFile, setNumbersFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleNumbersToXlsx = async () => {
    setErrorMessage(""); // Clear any previous errors
    setIsLoading(true);
    try {
      let numbersArray = [];
      if (numbersFile) {
        // If a file is uploaded, read its content
        // This would typically be handled by the backend, but for simplicity, we'll simulate it
        alert(
          "File upload for numbers to XLSX is not fully implemented in this example. Using textarea input instead."
        );
        if (numbersData) {
          numbersArray = numbersData
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => line.split(",").map((val) => val.trim()));
        }
      } else if (numbersData) {
        // Parse numbers from textarea
        numbersArray = numbersData
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => line.split(",").map((val) => val.trim()));
      } else {
        throw new Error("No numbers data or file provided.");
      }

      // Send to backend (assuming a future endpoint /api/convert-numbers)
      // For now, simulate the download locally
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Numbers");

      // Add rows from numbersArray
      numbersArray.forEach((row) => {
        worksheet.addRow(row);
      });

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "numbers.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error converting numbers to XLSX:", error);
      setErrorMessage(`Failed to convert numbers to XLSX: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNumbersFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setNumbersFile(e.target.files[0]);
    }
  };

  return (
    <CCard className="app-card">
      <CCardBody>
        <div className="text-center mb-4 app-upload-header">
          <h2>Numbers to XLSX Converter</h2>
          <p className="text-medium-emphasis">
            Enter numbers manually or upload a text file to convert to Excel
            format.
          </p>
        </div>
        {errorMessage && (
          <CAlert color="danger" className="mt-3">
            {errorMessage}
          </CAlert>
        )}
        <div className="mb-3">
          <CFormTextarea
            rows="5"
            placeholder="Enter numbers (one per line or comma-separated, e.g., 1,2,3 or 1\n2\n3)"
            value={numbersData}
            onChange={(e) => setNumbersData(e.target.value)}
            className="mb-3"
          />
          <CFormInput
            type="file"
            accept=".txt,.csv"
            onChange={handleNumbersFileChange}
            label="Upload Numbers File (optional)"
            className="mb-3"
          />
          {numbersFile && (
            <p className="text-success">Selected File: {numbersFile.name}</p>
          )}
        </div>
        <CRow className="mt-4 text-center justify-content-center app-buttons-row">
          <CCol xs="auto">
            <CButton
              color="primary"
              variant="outline"
              onClick={handleNumbersToXlsx}
              disabled={isLoading || (!numbersData && !numbersFile)}
            >
              Convert to XLSX
            </CButton>
          </CCol>
          <CCol xs="auto">
            <CButton color="dark" onClick={() => navigate("/")}>
              Back to MT940 Converter
            </CButton>
          </CCol>
        </CRow>
      </CCardBody>
    </CCard>
  );
}

export default App;
