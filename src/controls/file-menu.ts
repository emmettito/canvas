import {
  type FileMenuItem,
  type ToolbarControl,
} from "../models/toolbar-control.model";
import {
  createMenu,
  createTextButton,
} from "../components/canvas-toolbar/toolbar-elements";

/**
 * A "File" button with a menu of `items`, e.g.
 * `fileMenu([newCanvasItem(), historyItem(), renameItem(), exportItem()])`.
 * What an item opens sits beside the menu's button.
 */
export function fileMenu(items: FileMenuItem[]): ToolbarControl {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("The file menu needs at least one item.");
  }
  for (const item of items) {
    if (typeof (item as Partial<FileMenuItem> | null)?.select !== "function") {
      throw new Error(
        "The file menu lists something that isn't a menu item. Make each with an item function, e.g. renameItem()."
      );
    }
  }
  return {
    name: "file-menu",
    items,
    mount: (host) => {
      const button = createTextButton();
      button.textContent = "File";
      const popover = {
        key: "file-menu",
        opener: button,
        render: () =>
          createMenu(
            host,
            items.map((item) => ({
              label: item.label,
              disabled: item.isDisabled?.(host.state) ?? false,
              onSelect: () => item.select(host, button),
            }))
          ),
      };
      button.addEventListener("click", () => host.togglePopover(popover));
      return { element: button, anchored: true, expands: true };
    },
  };
}
