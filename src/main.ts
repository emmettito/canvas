// The demo page, which uses the library the way another project would. It's
// only for drawing, so nothing's saved: a refresh starts again.
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
  textEditor: proseMirrorEditor,
  toolbar: [
    [button("undo"), button("redo")],
    [
      button("move"),
      button("pencil"),
      button("highlighter"),
      button("eraser"),
      button("bucket"),
      button("note"),
      button("text"),
      button("shape"),
      { action: "color" },
      button("dropper"),
    ],
    [button("image")],
  ],
  // How the canvas is shown, apart from what's drawn on it.
  topRightToolbar: [[{ action: "zoom" }]],
});
