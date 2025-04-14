import { useState, useMemo } from "react";

const TransactionsTable = ({ transactions }) => {
  const [sortConfig, setSortConfig] = useState({
    key: "date",
    direction: "desc",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Sort transactions
  const sortedTransactions = useMemo(() => {
    if (!transactions) return [];

    const sortableItems = [...transactions];

    sortableItems.sort((a, b) => {
      if (sortConfig.key === "amount") {
        // Handle various amount formats safely
        let amountA, amountB;

        if (typeof a.amount === "string") {
          amountA = parseFloat(a.amount.replace(/[^0-9.-]+/g, ""));
        } else if (typeof a.amount === "number") {
          amountA = a.amount;
        } else {
          amountA = 0;
        }

        if (typeof b.amount === "string") {
          amountB = parseFloat(b.amount.replace(/[^0-9.-]+/g, ""));
        } else if (typeof b.amount === "number") {
          amountB = b.amount;
        } else {
          amountB = 0;
        }

        // Check for NaN
        if (isNaN(amountA)) amountA = 0;
        if (isNaN(amountB)) amountB = 0;

        if (amountA < amountB) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (amountA > amountB) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      } else {
        // Sort other columns as strings
        const valA = String(a[sortConfig.key] || "");
        const valB = String(b[sortConfig.key] || "");

        if (valA < valB) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      }
    });

    return sortableItems;
  }, [transactions, sortConfig]);

  // Filter transactions based on search term
  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return sortedTransactions;

    return sortedTransactions.filter((transaction) => {
      const searchLower = searchTerm.toLowerCase();
      const descriptionStr = String(
        transaction.description || ""
      ).toLowerCase();
      const dateStr = String(transaction.date || "").toLowerCase();
      const amountStr = String(transaction.amount || "").toLowerCase();

      return (
        descriptionStr.includes(searchLower) ||
        dateStr.includes(searchLower) ||
        amountStr.includes(searchLower)
      );
    });
  }, [sortedTransactions, searchTerm]);

  // Paginate transactions
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const requestSort = (key) => {
    let direction = "asc";

    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }

    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return null;

    return sortConfig.direction === "asc" ? (
      <span className="ml-1">↑</span>
    ) : (
      <span className="ml-1">↓</span>
    );
  };

  // Helper function to determine if amount is negative
  const isNegativeAmount = (amount) => {
    if (typeof amount === "string") {
      return amount.startsWith("-") || amount.includes("-");
    } else if (typeof amount === "number") {
      return amount < 0;
    }
    return false;
  };

  if (!transactions || transactions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded shadow">
      <div className="p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Transaction List
          </h2>

          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              className="block w-full pl-8 pr-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page when searching
              }}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("date")}
              >
                <div className="flex items-center">
                  Date {getSortIndicator("date")}
                </div>
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("amount")}
              >
                <div className="flex items-center">
                  Amount {getSortIndicator("amount")}
                </div>
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer"
                onClick={() => requestSort("description")}
              >
                <div className="flex items-center">
                  Description {getSortIndicator("description")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedTransactions.map((tx, idx) => (
              <tr
                key={idx}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 dark:text-gray-200">
                  {tx.date}
                </td>
                <td
                  className={`px-3 py-2 whitespace-nowrap text-xs font-medium ${
                    isNegativeAmount(tx.amount)
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                >
                  {tx.amount}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-300 truncate max-w-xs">
                  {tx.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 px-3 py-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
          <div className="flex-1 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                Page <span className="font-medium">{currentPage}</span> of{" "}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-2 py-1 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-medium ${
                    currentPage === 1
                      ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                  }`}
                >
                  <span className="sr-only">Previous</span>
                  <svg
                    className="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  let pageNum;

                  if (totalPages <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage <= 2) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 1) {
                    pageNum = totalPages - 2 + i;
                  } else {
                    pageNum = currentPage - 1 + i;
                  }

                  if (pageNum <= totalPages) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-2 py-1 border border-gray-300 dark:border-gray-600 text-xs font-medium ${
                          currentPage === pageNum
                            ? "z-10 bg-blue-50 dark:bg-blue-900 border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-300"
                            : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  return null;
                })}

                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages || totalPages === 0}
                  className={`relative inline-flex items-center px-2 py-1 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-medium ${
                    currentPage === totalPages || totalPages === 0
                      ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                  }`}
                >
                  <span className="sr-only">Next</span>
                  <svg
                    className="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsTable;
