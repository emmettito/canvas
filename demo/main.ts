// The demo page: a whole canvas built on the library's utilities, which it
// imports from `@emmettito/canvas` the way another project would. What's
// drawn is saved in the browser, so a refresh keeps it.
import "./demo.css";
import { createIcon } from "./demo-icons";
import { savedLocally } from "./stores/local-store";
import {
  bucketTool,
  clearButton,
  eraserTool,
  exportButton,
  handTool,
  highlighterTool,
  imageButton,
  mountCanvas,
  noteTool,
  pencilTool,
  selectTool,
  textTool,
  zoomControl,
} from "./canvas";
// Formatted text, through ProseMirror. It's apart from the rest, so pages
// without it don't load ProseMirror.
import { proseMirrorEditor } from "./plugins/prosemirror/prosemirror-editor";
// The canvas's variables and reset (see `canvas.ts`).
import "./styles.css";

mountCanvas(document.getElementById("root")!, {
  // The canvas doesn't keep anything itself, so the demo keeps it in the
  // browser, with a store of its own.
  ...savedLocally("canvas-demo"),
  textEditor: proseMirrorEditor,
  // The canvas's name is only shown, and changed, in the export dialog, and
  // in the tab's title.
  onNameChange: (name) => {
    document.title = `${name || "Untitled"} – Canvas Demo`;
  },
  // Each control is imported on its own, so the build only has these.
  toolbar: [
    [clearButton(createIcon("clear")), exportButton(createIcon("export"))],
    [
      selectTool(createIcon("select")),
      handTool(createIcon("hand")),
      pencilTool(createIcon("pencil")),
      highlighterTool(createIcon("highlighter")),
      eraserTool(createIcon("eraser")),
      bucketTool(createIcon("bucket")),
      noteTool(createIcon("note")),
      textTool(createIcon("text")),
      imageButton(createIcon("image")),
    ],
  ],
  // How the canvas is shown, apart from what's drawn on it.
  topRightToolbar: [[zoomControl()]],
});
