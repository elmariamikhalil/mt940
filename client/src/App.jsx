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

  const downloadFile = async (type) => {
    setErrorMessage(""); // Clear any previous errors
    try {
      let downloadPromise;
      let filename;
      if (type === "csv") {
        downloadPromise = apiService.downloadCSV(); // Should return axios promise
        filename = "transactions.csv";
      } else if (type === "excel") {
        downloadPromise = apiService.downloadExcel(); // Should return axios promise
        filename = "statement.xlsx";
      } else {
        throw new Error("Invalid download type");
      }

      // Await the axios response
      const response = await downloadPromise;

      // Check if the response status is OK before processing as Blob
      if (!response || response.status !== 200) {
        let errorText = "Unknown error";
        if (response.data) {
          try {
            // Attempt to parse error message if response.data is not a Blob
            if (!(response.data instanceof Blob)) {
              errorText = response.data.error || JSON.stringify(response.data);
            } else {
              errorText = "Unexpected response format";
            }
          } catch (e) {
            errorText = "Failed to parse error message";
          }
        }
        throw new Error(
          `Failed to download ${type.toUpperCase()}: Status ${
            response.status || "N/A"
          } - ${errorText}`
        );
      }

      // At this point, response.data should be a Blob
      const blob = response.data;
      if (!(blob instanceof Blob)) {
        throw new Error(
          `Failed to download ${type.toUpperCase()}: Response data is not a valid file.`
        );
      }

      // Create a blob URL and trigger download
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
    setActiveTab("results");
    setIsLoading(false);
    setErrorMessage(""); // Clear any errors on successful upload
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
                Upload
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
          </CNav>
          <CCardBody className="app-card-body">
            {activeTab === "upload" ? (
              <>
                <div className="text-center mb-4 app-upload-header">
                  <h2>MT940 File Converter</h2>
                  <p className="text-medium-emphasis">
                    Upload your MT940 file and convert it to CSV or Excel
                    format.
                  </p>
                </div>
                <FileUpload
                  setIsLoading={setIsLoading}
                  isLoading={isLoading}
                  onUploadComplete={handleUploadComplete}
                />
              </>
            ) : (
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
            )}
          </CCardBody>
        </CCard>
      </CContainer>
      <Footer />
    </div>
  );
}

export default App;
