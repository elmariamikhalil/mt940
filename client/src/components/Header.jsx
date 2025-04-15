import { useState, useEffect } from "react";
import {
  CHeader,
  CContainer,
  CHeaderBrand,
  CHeaderNav,
  CHeaderNavItem,
  CHeaderNavLink,
  CButton,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilMoon, cilSun } from "@coreui/icons";

const Header = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check if user prefers dark mode
    const isDark =
      localStorage.getItem("darkMode") === "true" ||
      (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    setIsDarkMode(isDark);

    if (isDark) {
      document.documentElement.classList.add("dark-theme");
    } else {
      document.documentElement.classList.remove("dark-theme");
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add("dark-theme");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark-theme");
      localStorage.setItem("darkMode", "false");
    }
  };

  return (
    <CHeader position="sticky" className="mb-0 border-bottom">
      <CContainer fluid>
        <CHeaderBrand className="d-flex align-items-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="me-2"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" />
            <path d="M16 12h.01M8 12h.01M12 8h.01M12 16h.01" />
          </svg>
          <span className="fs-5 fw-semibold">MT940 Converter</span>
        </CHeaderBrand>

        <CHeaderNav className="ms-auto d-flex align-items-center">
          <CHeaderNavItem>
            <CButton
              color="light"
              shape="rounded-pill"
              size="sm"
              onClick={toggleDarkMode}
              className="me-2"
            >
              <CIcon icon={isDarkMode ? cilSun : cilMoon} size="sm" />
            </CButton>
          </CHeaderNavItem>
          <CHeaderNavItem>
            <CHeaderNavLink
              href="https://github.com/elmariamikhalil/mt940-converter"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </CHeaderNavLink>
          </CHeaderNavItem>
        </CHeaderNav>
      </CContainer>
    </CHeader>
  );
};

export default Header;
