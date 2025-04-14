import { useState, useRef } from "react";
import apiService from "../api";

const FileUpload = ({ setIsLoading, isLoading, onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("mt940File", file);

    try {
      const res = await apiService.convertMT940(formData);
      onUploadComplete(res.data.transactions);
    } catch (error) {
      console.error("Upload error:", error);
      alert("There was an error uploading your file. Please try again.");
      setIsLoading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${
            dragActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/30"
          }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mt940,.sta"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full mb-2">
            {/* Reduced icon size */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
className="h-3 w-3 text-blue-500 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <p className="text-base font-medium text-gray-700 dark:text-gray-200">
              {file ? file.name : "Drag and drop your MT940 file here"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {file
                ? `${(file.size / 1024).toFixed(2)} KB`
                : "or click to browse"}
            </p>
          </div>

          {file && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              File selected
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        <button
          className={`
            px-4 py-2 rounded-lg font-medium text-white text-sm
            ${
              !file || isLoading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }
            transition-colors shadow-md flex items-center justify-center gap-2 mx-auto
          `}
          onClick={handleUpload}
          disabled={!file || isLoading}
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Processing...
            </>
          ) : (
            <>Convert File</>
          )}
        </button>
      </div>

      <div className="mt-4 text-center">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Supported Bank Formats
        </h3>
        <div className="flex flex-wrap justify-center gap-2">
          {["SWIFT MT940", "SEPA", "Rabobank", "ABN AMRO", "ING"].map(
            (bank) => (
              <span
                key={bank}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                {bank}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
