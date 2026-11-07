import {
  type FileMenuItem,
  type ToolbarControl,
  type ToolbarHost,
} from "../models/toolbar-control.model";
import {
  checkIcon,
  createIconButton,
} from "../components/canvas-toolbar/toolbar-elements";

const LABEL = "New canvas";

// Every change is saved as it's made, so nothing asks first.
function startNew({ closePopover, actions }: ToolbarHost) {
  closePopover();
  actions.onNewCanvas();
}

/**
 * Starts a blank canvas. Without `historyButton` or `historyItem`, there's
 * only ever the open canvas, so it's deleted.
 */
export function newCanvasButton(icon: Element): ToolbarControl {
  checkIcon(icon, "new-canvas");
  return {
    name: "new-canvas",
    mount: (host) => {
      const button = createIconButton(LABEL, icon);
      button.addEventListener("click", () => startNew(host));
      return {
        element: button,
        anchored: true,
        update: (state) => {
          button.disabled = !state.canStartNew;
        },
      };
    },
  };
}

/** `newCanvasButton`, in the file menu. */
export function newCanvasItem(): FileMenuItem {
  return {
    name: "new-canvas",
    label: LABEL,
    isDisabled: (state) => !state.canStartNew,
    select: startNew,
  };
}
