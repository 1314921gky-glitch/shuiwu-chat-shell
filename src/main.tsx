import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyCachedTheme } from "./lib/theme";
import "./styles.css";

applyCachedTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
