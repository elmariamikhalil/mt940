import { useState } from "react";
import FileUpload from "./components/FileUpload";
import TransactionsTable from "./components/TransactionsTable";
import API from "./api";

function App() {
  const [transactions, setTransactions] = useState([]);

  const downloadFile = (type) => {
    window.location.href = `https://graphtsy.org:5000/api/download/${type}`;
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl mb-6 font-bold">
        MT940 to CSV / Excel Converter
      </h1>

      <FileUpload setTransactions={setTransactions} />

      <TransactionsTable transactions={transactions} />

      {transactions.length > 0 && (
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => downloadFile("csv")}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Download CSV
          </button>

          <button
            onClick={() => downloadFile("excel")}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Download Excel
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
