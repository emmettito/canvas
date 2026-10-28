// Imported first so Tailwind declares its layer order before component CSS.
import "./index.css";
import { mountCanvas } from "./components/canvas-wrapper/canvas-wrapper";

mountCanvas(document.getElementById("root")!);
