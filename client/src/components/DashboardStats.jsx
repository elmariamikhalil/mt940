import { useMemo } from "react";

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
      // First check if amount is a string or number and convert properly
      let amount;
      if (typeof tx.amount === "string") {
        // Remove currency symbols and commas to convert to a number
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

      // Check for NaN
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

  // Format currency with the appropriate symbol
  const formatCurrency = (value) => {
    // You can customize this based on the currency in your data
    return `€${parseFloat(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-2">
        Transaction Summary
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Total Transactions */}
        <div className="bg-white dark:bg-gray-700 overflow-hidden shadow rounded">
          <div className="px-3 py-2">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 dark:bg-blue-800 rounded p-1.5">
                <svg
                  className="h-4 w-4 text-blue-600 dark:text-blue-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                    Transactions
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {stats.totalTransactions}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Total Income */}
        <div className="bg-white dark:bg-gray-700 overflow-hidden shadow rounded">
          <div className="px-3 py-2">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 dark:bg-green-800 rounded p-1.5">
                <svg
                  className="h-4 w-4 text-green-600 dark:text-green-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                    Income
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(stats.totalIncome)}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white dark:bg-gray-700 overflow-hidden shadow rounded">
          <div className="px-3 py-2">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-red-100 dark:bg-red-800 rounded p-1.5">
                <svg
                  className="h-4 w-4 text-red-600 dark:text-red-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 12H6"
                  />
                </svg>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                    Expenses
                  </dt>
                  <dd className="flex items-baseline">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(stats.totalExpenses)}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Net Balance */}
        <div className="bg-white dark:bg-gray-700 overflow-hidden shadow rounded">
          <div className="px-3 py-2">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-100 dark:bg-purple-800 rounded p-1.5">
                <svg
                  className="h-4 w-4 text-purple-600 dark:text-purple-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                    Balance
                  </dt>
                  <dd className="flex items-baseline">
                    <div
                      className={`text-sm font-semibold ${
                        parseFloat(stats.netBalance) >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(stats.netBalance)}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
