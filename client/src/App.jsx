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
      let url;
      let filename;
      if (type === "csv") {
        url = apiService.downloadCSV(); // Assuming this returns the endpoint URL
        filename = "transactions.csv";
      } else if (type === "excel") {
        url = apiService.downloadExcel(); // Assuming this returns the endpoint URL
        filename = "statement.xlsx";
      } else {
        throw new Error("Invalid download type");
      }

      // Use fetch to download the file
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/octet-stream",
        },
      });

      if (!response.ok) {
        // Handle non-200 responses (e.g., 404, 500)
        const errorText = await response.text();
        throw new Error(
          `Failed to download ${type.toUpperCase()}: ${response.status} - ${
            errorText || response.statusText
          }`
        );
      }

      // Create a blob from the response and trigger download
      const blob = await response.blob();
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
      setErrorMessage(
        error.message || `Failed to download ${type.toUpperCase()}`
      );
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
                        >
                          Download CSV
                        </CButton>
                      </CCol>
                      <CCol xs="auto">
                        <CButton
                          color="primary"
                          variant="outline"
                          onClick={() => downloadFile("excel")}
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
