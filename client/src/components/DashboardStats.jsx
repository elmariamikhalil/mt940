import { useMemo } from "react";
import { CCard, CCardBody, CCol, CRow } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilWallet, cilMoney, cilMinus, cilCalculator } from "@coreui/icons";

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
      <h4 className="mb-3">Transaction Summary</h4>
      <CRow className="g-3">
        {/* Total Transactions */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-primary bg-opacity-25 rounded">
                <CIcon icon={cilWallet} size="xl" className="text-primary" />
              </div>
              <div>
                <div className="text-sm text-medium-emphasis">Transactions</div>
                <div className="fs-5 fw-bold">{stats.totalTransactions}</div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        {/* Total Income */}
        <CCol xs={6} md={3}>
          <CCard className="h-100">
            <CCardBody className="d-flex align-items-center">
              <div className="me-3 p-2 bg-success bg-opacity-25 rounded">
                <CIcon icon={cilMoney} size="xl" className="text-success" />
              </div>
              <div>
                <div className="text-sm text-medium-emphasis">Income</div>
                <div className="fs-5 fw-bold">
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
                <CIcon icon={cilMinus} size="xl" className="text-danger" />
              </div>
              <div>
                <div className="text-sm text-medium-emphasis">Expenses</div>
                <div className="fs-5 fw-bold">
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
              <div className="me-3 p-2 bg-info bg-opacity-25 rounded">
                <CIcon icon={cilCalculator} size="xl" className="text-info" />
              </div>
              <div>
                <div className="text-sm text-medium-emphasis">Balance</div>
                <div
                  className={`fs-5 fw-bold ${
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
