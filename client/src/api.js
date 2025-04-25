import axios from "axios";

// ✅ Updated Base URL: use new subdomain or fallback
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "https://mt940.axoplan.com:5002";

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
  (error) => Promise.reject(error)
);

// Add a response interceptor for handling errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const customError = {
      message: error.response?.data?.message || "Network error occurred",
      status: error.response?.status || 500,
    };
    console.error("API Error:", customError);
    return Promise.reject(customError);
  }
);

// API endpoints as methods
const apiService = {
  convertMT940: (formData) =>
    axiosInstance.post("/api/convert", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),
  // Download endpoints - Use /api/download to match backend
  downloadCSV: () =>
    axiosInstance.get("/api/download/csv", {
      responseType: "blob", // Handle binary data for file download
    }),
  downloadExcel: () =>
    axiosInstance.get("/api/download/excel", {
      responseType: "blob", // Handle binary data for file download
    }),
};

export default apiService;
