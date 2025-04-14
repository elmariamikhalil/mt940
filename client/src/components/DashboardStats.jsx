import { useMemo } from "react";
import { CCard, CCardBody, CCol, CRow } from "@coreui/react";
import { FaWallet, FaMoneyBill, FaMinus, FaCalculator } from "react-icons/fa";

const DashboardStats = ({ transactions }) => {
  const stats = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return {
        totalTransactions: 0,
        totalIncome: 0,
        totalExpenses: 0,
        netBalance: 0,
      };
    }
    let totalIncome = 0;
    let totalExpenses = 0;
    transactions.forEach((tx) => {
      let amount;
      if (typeof tx.amount === "string") {
        amount = parseFloat(tx.amount.replace(/[^0-9.-]+/g, ""));
      } else if (typeof tx.amount === "number") {
        amount = tx.amount;
      } else {
        console.warn(
          "Transaction amount has unexpected type:",
          typeof tx.amount,
          tx.amount
        );
        amount = 0;
      }
      if (isNaN(amount)) {
        console.warn("Could not parse transaction amount:", tx.amount);
        amount = 0;
      }
      if (amount > 0) {
        totalIncome += amount;
      } else {
        totalExpenses += Math.abs(amount);
      }
    });
    return {
      totalTransactions: transactions.length,
      totalIncome: totalIncome.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netBalance: (totalIncome - totalExpenses).toFixed(2),
    };
  }, [transactions]);

  const formatCurrency = (value) => {
    return `€${parseFloat(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold mb-3">Transaction Summary</h2>
      <CRow className="g-3">
        {/* Total Transactions */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-primary bg-opacity-25 rounded">
                <FaWallet size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted">Transactions</div>
                <div className="text-lg font-weight-bold">
                  {stats.totalTransactions}
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        {/* Total Income */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-success bg-opacity-25 rounded">
                <CIcon icon={cilMoney} size="lg" className="text-success" />
              </div>
              <div>
                <div className="text-sm text-muted">Income</div>
                <div className="text-lg font-weight-bold">
                  {formatCurrency(stats.totalIncome)}
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        {/* Total Expenses */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-danger bg-opacity-25 rounded">
                <CIcon icon={cilMinus} size="lg" className="text-danger" />
              </div>
              <div>
                <div className="text-sm text-muted">Expenses</div>
                <div className="text-lg font-weight-bold">
                  {formatCurrency(stats.totalExpenses)}
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        {/* Net Balance */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-purple bg-opacity-25 rounded">
                <CIcon icon={cilCalculator} size="lg" className="text-purple" />
              </div>
              <div>
                <div className="text-sm text-muted">Balance</div>
                <div
                  className={`text-lg font-weight-bold ${
                    parseFloat(stats.netBalance) >= 0
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {formatCurrency(stats.netBalance)}
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default DashboardStats;
