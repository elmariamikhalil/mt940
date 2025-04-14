const TransactionsTable = ({ transactions }) => {
  if (!transactions.length) return null;

  return (
    <table className="w-full mt-4 border">
      <thead>
        <tr>
          <th className="border px-4 py-2">Date</th>
          <th className="border px-4 py-2">Amount</th>
          <th className="border px-4 py-2">Description</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx, idx) => (
          <tr key={idx}>
            <td className="border px-4 py-2">{tx.date}</td>
            <td className="border px-4 py-2">{tx.amount}</td>
            <td className="border px-4 py-2">{tx.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TransactionsTable;
