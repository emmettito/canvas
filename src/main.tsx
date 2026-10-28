// Imported first so Tailwind declares its layer order before component CSS.
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CanvasWrapper } from "./components/canvas-wrapper/canvas-wrapper";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CanvasWrapper />
  </StrictMode>
);
