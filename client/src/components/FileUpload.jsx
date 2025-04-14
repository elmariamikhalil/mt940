import { useState, useRef } from "react";
import {
  CCard,
  CCardBody,
  CButton,
  CFormInput,
  CAlert,
  CSpinner,
} from "@coreui/react";
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
    <CCard className="shadow-sm">
      <CCardBody>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
          className={`border rounded p-5 text-center cursor-pointer ${
            dragActive ? "border-primary bg-light" : "border-secondary"
          }`}
          style={{ borderStyle: "dashed", transition: "0.3s" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mt940,.sta"
            onChange={handleFileChange}
            className="d-none"
          />

          <div className="d-flex flex-column align-items-center">
            <div className="mb-3 bg-primary-subtle text-primary p-3 rounded-circle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={32}
                height={32}
                fill="currentColor"
                className="bi bi-cloud-upload"
                viewBox="0 0 16 16"
              >
                <path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.02 0 3.79 1.087 4.754 2.748A3.5 3.5 0 0 1 14.5 9H13a2.5 2.5 0 1 0-4.9-.6H7a.5.5 0 0 0 0 1h1.1A2.5 2.5 0 1 0 13 10h1.5a2.5 2.5 0 0 0 .248-4.985A6.502 6.502 0 0 0 8 1.5a6.52 6.52 0 0 0-3.594 9.292.5.5 0 0 1-.812.584A7.518 7.518 0 0 1 4.406 1.342z" />
                <path d="M7.646 7.146a.5.5 0 0 1 .708 0L9.5 8.293V3.5a.5.5 0 0 1 1 0v4.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 0-.708z" />
              </svg>
            </div>

            <h5 className="fw-semibold">
              {file ? file.name : "Drag & drop or click to select file"}
            </h5>
            <p className="text-muted small">
              {file
                ? `${(file.size / 1024).toFixed(2)} KB`
                : "Supported: .mt940, .sta"}
            </p>

            {file && (
              <CAlert color="success" className="mt-2 py-1 px-3 w-auto">
                File selected
              </CAlert>
            )}
          </div>
        </div>

        <div className="mt-4 text-center">
          <CButton
            color="primary"
            disabled={!file || isLoading}
            onClick={handleUpload}
          >
            {isLoading ? (
              <>
                <CSpinner size="sm" className="me-2" />
                Processing...
              </>
            ) : (
              "Convert File"
            )}
          </CButton>
        </div>

        <div className="mt-4 text-center">
          <small className="text-muted fw-semibold">
            Supported Bank Formats:
          </small>
          <div className="d-flex justify-content-center flex-wrap gap-2 mt-2">
            {["SWIFT MT940", "SEPA", "Rabobank", "ABN AMRO", "ING"].map(
              (bank) => (
                <span
                  key={bank}
                  className="badge text-bg-secondary rounded-pill px-3"
                >
                  {bank}
                </span>
              )
            )}
          </div>
        </div>
      </CCardBody>
    </CCard>
  );
};

export default FileUpload;
