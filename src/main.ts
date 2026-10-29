// The demo page, which uses the library the way another project would.
import "./demo.css";
import { createIcon, createPageIcon } from "./demo-icons";
import { mountCanvas, type ToolbarAction, type ToolbarControl } from "./index";
// Like `@emmettito/canvas/prosemirror` in another project, for formatted text.
import { proseMirrorEditor } from "./prosemirror";
// Like `canvas/styles.css` in another project. Importing `./index` isn't
// enough: `sideEffects` in package.json lets the build skip that file, along
// with its own import of the styles.
import "./styles.css";
import { setUpBackgroundPicker } from "./background-picker";
import {
  setUpNameField,
  setUpPhotoField,
  setUpShowAuthorsField,
} from "./profile";
import { setUpSettings } from "./settings";
import { setUpSharing } from "./share";
import { setUpThemePicker } from "./theme";

// A toolbar button with the demo's icon for it.
function button(action: ToolbarAction): ToolbarControl {
  return { action, icon: createIcon(action) };
}

const settings = document.querySelector<HTMLDialogElement>(".demo-settings")!;
settings.querySelector(".demo-settings-close")!.append(createPageIcon("close"));
const openSettings = setUpSettings(settings);
setUpThemePicker(settings.querySelector(".demo-theme-picker")!);
// Set up first, so the canvas starts with the saved name. Typing it in only
// happens once the canvas is there.
const name = setUpNameField(
  settings.querySelector(".demo-name-field")!,
  (value) => canvas.setAuthor(value)
);
const avatar = setUpPhotoField(
  settings.querySelector(".demo-photo-field")!,
  (value) => canvas.setAvatar(value)
);
const showAuthors = setUpShowAuthorsField(
  settings.querySelector(".demo-show-authors")!,
  (show) => canvas.setShowAuthors(show)
);
// Set up first, since the canvas shows its background as it mounts. It's only
// picked from once the canvas is there.
const showBackground = setUpBackgroundPicker(
  settings.querySelector(".demo-background-picker")!,
  (color) => canvas.setBackground(color)
);
// Only with a server to pass the drawing between everyone drawing together,
// the dev server or `npm start`'s. GitHub Pages has none, so there's no
// Share button there.
const share = document.querySelector<HTMLDialogElement>(".demo-share")!;
share.querySelector(".demo-share-close")!.append(createPageIcon("close"));
const sharing = setUpSharing(share, setUpSettings(share), () => canvas);
const canvas = mountCanvas(document.getElementById("root")!, {
  storageKey: "canvas",
  textEditor: proseMirrorEditor,
  author: name,
  avatar,
  showAuthors,
  // The tab shows which canvas is open.
  onNameChange: (name) => {
    document.title = `${name || "Untitled"} – Canvas Demo`;
  },
  onBackgroundChange: showBackground,
  topToolbar: [
    [
      {
        action: "file-menu",
        items: ["new-canvas", "history", "rename", "export"],
      },
      // The page's own settings, beside the canvas's File menu.
      { action: "custom", label: "Settings", onClick: openSettings },
      ...(sharing
        ? [{ action: "custom", label: "Share", onClick: sharing.open } as const]
        : []),
    ],
  ],
  toolbar: [
    [button("undo"), button("redo"), button("clear")],
    [
      button("move"),
      button("pencil"),
      button("eraser"),
      button("bucket"),
      button("note"),
      button("text"),
      { action: "color" },
      button("dropper"),
    ],
    [button("image")],
  ],
  // A timer that goes off for everyone drawing together, and how the canvas
  // is shown, apart from what's drawn on it.
  topRightToolbar: [[{ action: "timer" }], [{ action: "zoom" }]],
});
// A shared canvas's link joins it.
sharing?.joinFromAddress();
