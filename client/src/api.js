import axios from "axios";

// ✅ Updated Base URL: use new subdomain or fallback
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "https://api.mt940.axoplan.com/api";

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
    // Optionally attach auth tokens here
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
  // MT940 Conversion
  convertMT940: (formData) =>
    axiosInstance.post("/convert", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  // Download endpoints
  downloadCSV: () => `${apiBaseUrl}/download/csv`,
  downloadExcel: () => `${apiBaseUrl}/download/excel`,
};

export default apiService;
