import { useState } from "react";
import API from "../api";

const FileUpload = ({ setTransactions }) => {
  const [file, setFile] = useState(null);

  const handleUpload = async () => {
    if (!file) return alert("Select a file first.");

    const formData = new FormData();
    formData.append("mt940File", file); // Ensure this matches the backend field name

    const res = await API.post("/convert", formData);
    setTransactions(res.data.transactions);
  };

  return (
    <div className="flex flex-col gap-4">
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button
        className="bg-black text-white px-4 py-2 rounded"
        onClick={handleUpload}
      >
        Upload & Convert
      </button>
    </div>
  );
};

export default FileUpload;
