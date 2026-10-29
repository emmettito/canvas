// The toolbar's buttons. Each shows an icon the host page gives it.
export type ToolbarAction =
  | "undo"
  | "redo"
  | "clear"
  | "new-canvas"
  | "history"
  | "export"
  | "move"
  | "pencil"
  | "eraser"
  | "bucket"
  | "note"
  | "text"
  | "dropper"
  | "image";

// What the file menu can list. Menu items are text, so they don't take icons.
// Renaming is only in the menu, since there's no button for it.
export type FileMenuItem = "new-canvas" | "history" | "rename" | "export";

/**
 * A control on the toolbar. Buttons need an icon, e.g. an `<svg>`, which is
 * copied, shown at 16 by 16 pixels and hidden from screen readers. The
 * toolbar gives each button its name. The color control shows the current
 * color, the zoom control the zoom, and the file menu is a "File" button, so
 * they don't take one. A custom control is the host page's own text button,
 * e.g. to open its settings, and there can be any number of them.
 */
export type ToolbarControl =
  | { action: ToolbarAction; icon: Element }
  | { action: "color" }
  | { action: "zoom" }
  | { action: "file-menu"; items: FileMenuItem[] }
  | { action: "custom"; label: string; onClick: () => void };

// What the zoom control's menu does.
export type ZoomAction = "in" | "out" | "reset" | "fit";
