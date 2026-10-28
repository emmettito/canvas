// The demo page, which uses the library the way another project would.
import "./demo.css";
import { mountCanvas } from "./index";
// Like `canvas/styles.css` in another project. Importing `./index` isn't
// enough: `sideEffects` in package.json lets the build skip that file, along
// with its own import of the styles.
import "./styles.css";
import { setUpThemeToggle } from "./theme";

setUpThemeToggle(document.querySelector(".demo-theme-toggle")!);
mountCanvas(document.getElementById("root")!);
