import { type CanvasEntry, UNTITLED_NAME } from "@emmettito/canvas";
import {
  type FileMenuItem,
  type ToolbarControl,
  type ToolbarHost,
  type ToolbarPopover,
} from "../models/toolbar-control.model";
import {
  checkIcon,
  createButton,
  createIconButton,
} from "../components/canvas-toolbar/toolbar-elements";
import { createElement } from "../utilities/create-element";

// The canvases drawn earlier, to open or delete, beside `opener`.
function createPopover(host: ToolbarHost, opener: HTMLElement): ToolbarPopover {
  const popover: ToolbarPopover = {
    key: "history",
    opener,
    render: () => {
      const { canvases } = host.state;
      if (canvases.length === 0) {
        const empty = createElement("p", "canvas-history-empty");
        empty.textContent = "Canvases you draw on show up here.";
        return empty;
      }
      const list = createElement("ul", "canvas-history");
      for (const entry of canvases) {
        list.append(createItem(host, entry, popover));
      }
      return list;
    },
  };
  return popover;
}

function createItem(
  host: ToolbarHost,
  { id, name, updatedAt }: CanvasEntry,
  popover: ToolbarPopover
): HTMLLIElement {
  const label = name || UNTITLED_NAME;
  const isOpen = id === host.state.openCanvasId;
  const item = createElement("li", "canvas-history-item");

  // Opening the open canvas again would do nothing, so it isn't a button.
  const open = isOpen
    ? createElement("div", "canvas-history-open")
    : createButton("canvas-history-open");
  if (!isOpen) {
    open.setAttribute("aria-label", `Open ${label}`);
    open.addEventListener("click", () => {
      host.closePopover();
      host.actions.onOpenCanvas(id);
    });
  }
  const nameElement = createElement("span", "canvas-history-name");
  nameElement.textContent = label;
  const date = createElement("span", "canvas-history-date");
  date.textContent = isOpen
    ? "Open now"
    : new Date(updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
  open.append(nameElement, date);

  // Deleting can't be undone, so the first click asks for a second.
  const remove = createButton("canvas-history-delete");
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${label}`);
  remove.addEventListener("click", () => {
    if (remove.dataset.confirming === undefined) {
      remove.dataset.confirming = "";
      remove.textContent = "Confirm";
      remove.setAttribute("aria-label", `Confirm deleting ${label}`);
      return;
    }
    host.actions.onDeleteCanvas(id);
    // Show the shorter list.
    host.closePopover();
    host.togglePopover(popover);
  });
  item.append(open, remove);
  return item;
}

/**
 * Lists the canvases drawn earlier, most recently edited first, to open or
 * delete.
 */
export function historyButton(icon: Element): ToolbarControl {
  checkIcon(icon, "history");
  return {
    name: "history",
    mount: (host) => {
      const button = createIconButton("History", icon);
      const popover = createPopover(host, button);
      button.addEventListener("click", () => host.togglePopover(popover));
      return { element: button, anchored: true, expands: true };
    },
  };
}

/** `historyButton`, in the file menu, where it's called Open. */
export function historyItem(): FileMenuItem {
  return {
    name: "history",
    label: "Open",
    select: (host, opener) => host.togglePopover(createPopover(host, opener)),
  };
}
