import { useState, useMemo } from "react";
import {
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CFormInput,
  CPagination,
  CPaginationItem,
  CCard,
  CCardHeader,
  CCardBody,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilSearch, cilArrowTop, cilArrowBottom } from "@coreui/icons";

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
        let amountA = parseFloat(
          String(a.amount || "0").replace(/[^0-9.-]+/g, "")
        );
        let amountB = parseFloat(
          String(b.amount || "0").replace(/[^0-9.-]+/g, "")
        );
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

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <CIcon icon={cilArrowTop} size="sm" />
    ) : (
      <CIcon icon={cilArrowBottom} size="sm" />
    );
  };

  // Helper function to determine if amount is negative
  const isNegativeAmount = (amount) => {
    const numAmount = parseFloat(
      String(amount || "0").replace(/[^0-9.-]+/g, "")
    );
    return !isNaN(numAmount) && numAmount < 0;
  };

  // Format amount for display
  const formatAmount = (amount) => {
    const numAmount = parseFloat(
      String(amount || "0").replace(/[^0-9.-]+/g, "")
    );
    if (isNaN(numAmount)) return "N/A";
    return numAmount.toFixed(2); // Always show 2 decimal places
  };

  // Log transactions for debugging
  console.log("Transactions in TransactionsTable:", transactions);

  if (!transactions || transactions.length === 0) return null;

  return (
    <CCard className="transactions-card mb-4">
      <CCardHeader className="transactions-card-header d-flex justify-content-between align-items-center py-2">
        <h5 className="mb-0 transactions-title">Transaction List</h5>
        <div className="transactions-search-wrapper position-relative">
          <CIcon
            icon={cilSearch}
            size="sm"
            className="position-absolute text-medium-emphasis transactions-search-icon"
            style={{ left: "10px", top: "50%", transform: "translateY(-50%)" }}
          />
          <CFormInput
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset to first page when searching
            }}
            className="transactions-search-input ps-4"
            style={{ width: "250px" }}
          />
        </div>
      </CCardHeader>
      <CCardBody className="transactions-card-body p-0">
        <div className="table-responsive transactions-table-wrapper">
          <CTable hover className="transactions-table mb-0">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell
                  scope="col"
                  className="transactions-header-cell cursor-pointer"
                  onClick={() => requestSort("date")}
                >
                  <div className="d-flex align-items-center">
                    Date {getSortIcon("date")}
                  </div>
                </CTableHeaderCell>
                <CTableHeaderCell
                  scope="col"
                  className="transactions-header-cell cursor-pointer"
                  onClick={() => requestSort("amount")}
                >
                  <div className="d-flex align-items-center">
                    Amount {getSortIcon("amount")}
                  </div>
                </CTableHeaderCell>
                <CTableHeaderCell
                  scope="col"
                  className="transactions-header-cell cursor-pointer"
                  onClick={() => requestSort("description")}
                >
                  <div className="d-flex align-items-center">
                    Description {getSortIcon("description")}
                  </div>
                </CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {paginatedTransactions.map((tx, idx) => (
                <CTableRow key={idx}>
                  <CTableDataCell>{tx.date}</CTableDataCell>
                  <CTableDataCell
                    className={`fw-semibold transactions-amount-cell ${
                      isNegativeAmount(tx.amount)
                        ? "text-danger"
                        : "text-success"
                    }`}
                  >
                    {formatAmount(tx.amount)}
                  </CTableDataCell>
                  <CTableDataCell
                    className="text-truncate transactions-description-cell"
                    style={{ maxWidth: "300px" }}
                  >
                    {tx.description || "N/A"}
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="transactions-pagination-wrapper d-flex justify-content-between align-items-center p-3 border-top">
            <div className="transactions-pagination-info small text-medium-emphasis">
              Page {currentPage} of {totalPages}
            </div>
            <CPagination
              align="end"
              size="sm"
              className="transactions-pagination"
            >
              <CPaginationItem
                aria-label="Previous"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <span aria-hidden="true">«</span>
              </CPaginationItem>
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
                    <CPaginationItem
                      key={pageNum}
                      active={currentPage === pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </CPaginationItem>
                  );
                }
                return null;
              })}
              <CPaginationItem
                aria-label="Next"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
              >
                <span aria-hidden="true">»</span>
              </CPaginationItem>
            </CPagination>
          </div>
        )}
      </CCardBody>
    </CCard>
  );
};

export default TransactionsTable;
