import { type ToolbarControl } from "../models/toolbar-control.model";
import {
  checkIcon,
  createIconButton,
  getModShortcut,
} from "../components/canvas-toolbar/toolbar-elements";

/** Undoes the last change. Ctrl+Z (Cmd+Z on a Mac) does too, without it. */
export function undoButton(icon: Element): ToolbarControl {
  checkIcon(icon, "undo");
  return {
    name: "undo",
    mount: ({ actions }) => {
      const button = createIconButton("Undo", icon, getModShortcut("Z"));
      button.addEventListener("click", () => actions.onUndo());
      return {
        element: button,
        update: (state) => {
          button.disabled = !state.canUndo;
        },
      };
    },
  };
}

/**
 * Redoes the last change undone. Ctrl+Shift+Z or Ctrl+Y (Cmd+Shift+Z on a
 * Mac) does too, without it.
 */
export function redoButton(icon: Element): ToolbarControl {
  checkIcon(icon, "redo");
  return {
    name: "redo",
    mount: ({ actions }) => {
      const shortcut = getModShortcut("Z", true);
      // Ctrl+Y works too, except on a Mac.
      if (shortcut.aria.startsWith("Control")) {
        shortcut.aria += " Control+Y";
      }
      const button = createIconButton("Redo", icon, shortcut);
      button.addEventListener("click", () => actions.onRedo());
      return {
        element: button,
        update: (state) => {
          button.disabled = !state.canRedo;
        },
      };
    },
  };
}
