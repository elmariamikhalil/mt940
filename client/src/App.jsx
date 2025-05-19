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
import * as XLSX from "xlsx";
import "@coreui/coreui/dist/css/coreui.min.css";
import "./App.css";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [errorMessage, setErrorMessage] = useState("");
  const [numbersData, setNumbersData] = useState("");
  const [numbersFile, setNumbersFile] = useState(null);

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

  const handleUploadComplete = (data) => {
    setTransactions(data);
    setActiveTab("results");
    setIsLoading(false);
    setErrorMessage("");
  };

  const handleNumbersToXlsx = async () => {
    setErrorMessage("");
    setIsLoading(true);
    try {
      let formData = new FormData();
      if (numbersFile) {
        formData.append("file", numbersFile);
      } else if (numbersData) {
        formData.append("numbersData", numbersData);
      } else {
        throw new Error("No numbers data or file provided.");
      }

      const response = await apiService.convertNumbersToXlsx(formData);

      if (!response || response.status !== 200) {
        let errorText = "Unknown error";
        if (response.data && !(response.data instanceof Blob)) {
          errorText = response.data.error || JSON.stringify(response.data);
        }
        throw new Error(
          `Failed to convert numbers to XLSX: Status ${
            response.status || "N/A"
          } - ${errorText}`
        );
      }

      const blob = response.data;
      if (!(blob instanceof Blob)) {
        throw new Error(
          `Failed to convert numbers to XLSX: Response data is not a valid file.`
        );
      }

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

  const generateXlsx = (numbersArray) => {
    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(numbersArray);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Numbers");

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "binary" });
      const blob = new Blob([s2ab(wbout)], {
        type: "application/octet-stream",
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
      console.error("Error generating XLSX:", error);
      setErrorMessage(`Failed to generate XLSX: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const s2ab = (s) => {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) {
      view[i] = s.charCodeAt(i) & 0xff;
    }
    return buf;
  };

  const handleNumbersFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setNumbersFile(e.target.files[0]);
    }
  };

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
                Numbers to XLSX
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
              <>
                <div className="text-center mb-4 app-upload-header">
                  <h2>Numbers to XLSX Converter</h2>
                  <p className="text-medium-emphasis">
                    Enter numbers manually or upload a text file to convert to
                    Excel format.
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
                    <p className="text-success">
                      Selected File: {numbersFile.name}
                    </p>
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
                </CRow>
              </>
            )}
          </CCardBody>
        </CCard>
      </CContainer>
      <Footer />
    </div>
  );
}

export default App;
