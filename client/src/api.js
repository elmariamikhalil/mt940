import axios from "axios";

// Read environment variables or fallback to default
// Checking original App.jsx to see where the API was pointed
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "https://axoplan.com:5002/api";

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor for handling auth tokens if needed
axiosInstance.interceptors.request.use(
  (config) => {
    // You can add authentication tokens here if needed
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

  // Download files
  downloadCSV: () => `${apiBaseUrl}/download/csv`,
  downloadExcel: () => `${apiBaseUrl}/download/excel`,
};

export default apiService;
