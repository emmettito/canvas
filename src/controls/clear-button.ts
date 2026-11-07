import { type ToolbarControl } from "../models/toolbar-control.model";
import {
  checkIcon,
  createButton,
  createIconButton,
} from "../components/canvas-toolbar/toolbar-elements";
import { createElement } from "../utilities/create-element";

/**
 * Removes everything on the canvas, for good. Clearing can't be undone, so
 * it's asked about first.
 */
export function clearButton(icon: Element): ToolbarControl {
  checkIcon(icon, "clear");
  return {
    name: "clear",
    mount: (host) => {
      const button = createIconButton("Clear", icon);
      const popover = {
        key: "clear",
        opener: button,
        render: () => {
          const form = createElement("div", "canvas-form canvas-clear");
          const title = createElement("p", "canvas-confirmation-message");
          title.textContent = "Clear the canvas?";
          const detail = createElement("p", "canvas-confirmation-detail");
          detail.textContent =
            "Everything on it will be removed. This can't be undone.";
          const buttons = createElement("div", "canvas-confirmation-buttons");
          const cancel = createButton("canvas-button");
          cancel.textContent = "Cancel";
          cancel.addEventListener("click", () => host.closePopover());
          const clear = createButton("canvas-button canvas-button-danger");
          clear.textContent = "Clear";
          clear.addEventListener("click", () => {
            host.closePopover();
            host.actions.onClear();
          });
          buttons.append(cancel, clear);
          form.append(title, detail, buttons);
          return form;
        },
      };
      button.addEventListener("click", () => host.togglePopover(popover));
      return {
        element: button,
        anchored: true,
        update: (state) => {
          button.disabled = !state.canClear;
        },
      };
    },
  };
}
