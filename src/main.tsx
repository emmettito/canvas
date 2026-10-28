import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CanvasWrapper } from "./components/canvas-wrapper/canvas-wrapper";
import "./index.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CanvasWrapper />
  </StrictMode>
);
