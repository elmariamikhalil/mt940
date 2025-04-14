import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Detect preferred color scheme
const setInitialColorMode = () => {
  const isDarkMode =
    localStorage.getItem("darkMode") === "true" ||
    (window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDarkMode) {
    document.documentElement.classList.add("dark");
  }
};

// Set initial color mode
setInitialColorMode();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
