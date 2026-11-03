// The demo page, which uses the library the way another project would. What's
// drawn is saved in the browser, so a refresh keeps it.
import "./demo.css";
import { createIcon } from "./demo-icons";
import { mountCanvas, type ToolbarAction, type ToolbarControl } from "./index";
// Like `@emmettito/canvas/prosemirror` in another project, for formatted text.
import { proseMirrorEditor } from "./prosemirror";
// Like `canvas/styles.css` in another project. Importing `./index` isn't
// enough: `sideEffects` in package.json lets the build skip that file, along
// with its own import of the styles.
import "./styles.css";

// A toolbar button with the demo's icon for it.
function button(action: ToolbarAction): ToolbarControl {
  return { action, icon: createIcon(action) };
}

mountCanvas(document.getElementById("root")!, {
  storageKey: "canvas-demo",
  textEditor: proseMirrorEditor,
  // The canvas's name is only shown, and changed, in the export dialog, and
  // in the tab's title.
  onNameChange: (name) => {
    document.title = `${name || "Untitled"} – Canvas Demo`;
  },
  toolbar: [
    [button("clear"), button("export")],
    [
      button("select"),
      button("hand"),
      button("pencil"),
      button("highlighter"),
      button("eraser"),
      button("bucket"),
      button("note"),
      button("text"),
      button("image"),
    ],
  ],
  // How the canvas is shown, apart from what's drawn on it.
  topRightToolbar: [[{ action: "zoom" }]],
});
