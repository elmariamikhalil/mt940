import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FileUpload from "./components/FileUpload";
import TransactionsTable from "./components/TransactionsTable";
import Header from "./components/Header";
import Footer from "./components/Footer";
import DashboardStats from "./components/DashboardStats";
import apiService from "./api";

function App() {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  const downloadFile = (type) => {
    if (type === "csv") {
      window.location.href = apiService.downloadCSV();
    } else if (type === "excel") {
      window.location.href = apiService.downloadExcel();
    }
  };

  const handleUploadComplete = (data) => {
    setTransactions(data);
    setActiveTab("results");
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col transition-colors duration-300">
      <Header />

      <main className="flex-grow container mx-auto px-4 py-6 max-w-6xl">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {["upload", "results"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={tab === "results" && transactions.length === 0}
                className={`relative px-5 py-3 text-sm font-semibold transition-colors duration-300
                  ${
                    activeTab === tab
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  } ${
                  tab === "results" && transactions.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {tab === "upload" ? "Upload" : "Results"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              {activeTab === "upload" ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                      MT940 File Converter
                    </h1>
                    <p className="text-base text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mt-2">
                      Upload your MT940 file and convert it to CSV or Excel.
                      View transactions in a clean, organized table.
                    </p>
                  </div>

                  <FileUpload
                    setIsLoading={setIsLoading}
                    isLoading={isLoading}
                    onUploadComplete={handleUploadComplete}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  {transactions.length > 0 && (
                    <>
                      <DashboardStats transactions={transactions} />
                      <TransactionsTable transactions={transactions} />

                      <div className="flex flex-wrap gap-3 mt-6 justify-center">
                        {[
                          {
                            label: "Download CSV",
                            type: "csv",
                            color: "green",
                          },
                          {
                            label: "Download Excel",
                            type: "excel",
                            color: "blue",
                          },
                          {
                            label: "Upload New File",
                            type: "upload",
                            color: "gray",
                          },
                        ].map(({ label, type, color }) => (
                          <button
                            key={type}
                            onClick={() => {
                              if (type === "upload") setActiveTab("upload");
                              else downloadFile(type);
                            }}
                            className={`flex items-center gap-2 bg-${color}-600 hover:bg-${color}-700 text-white px-4 py-2 rounded-lg text-sm shadow transition-all duration-200`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default App;
