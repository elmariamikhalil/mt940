import axios from "axios";

// ✅ Updated Base URL: use environment variable, fallback to local dev if needed
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  "https://mt940.axoplan.com:5002/api" ||
  "http://localhost:5002/api"; // Fallback to local dev server (no SSL)

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor (optional auth token logic here)
axiosInstance.interceptors.request.use(
  (config) => {
    console.log(`Making request to: ${config.url}`); // Log request URL for debugging
    return config;
  },
  (error) => {
    console.error("Request Interceptor Error:", error);
    return Promise.reject(error);
  }
);

// Add a response interceptor for handling errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const customError = {
      message:
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Network error occurred",
      status: error.response?.status || 500,
      details: error.response?.data?.details || null,
    };
    console.error("API Error:", customError);
    // Add specific hint for SSL or network errors
    if (
      error.code === "ERR_NETWORK" ||
      error.message.includes("Network Error")
    ) {
      customError.message += " (Possible SSL certificate or connection issue)";
    }
    return Promise.reject(customError);
  }
);

// API endpoints as methods
const apiService = {
  // MT940 Conversion
  convertMT940: (formData) =>
    axiosInstance.post("/convert", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  // Download endpoints - updated to use axios for consistency and error handling
  downloadCSV: () =>
    axiosInstance.get("/download/csv", {
      responseType: "blob", // Handle binary data for file download
    }),

  downloadExcel: () =>
    axiosInstance.get("/download/excel", {
      responseType: "blob", // Handle binary data for file download
    }),
};

export default apiService;
