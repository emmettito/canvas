import { type FileMenuItem } from "../models/toolbar-control.model";
import { UNTITLED_NAME } from "../constants/untitled-name.const";
import {
  createFormButtons,
  createSubmitButton,
} from "../components/canvas-toolbar/toolbar-elements";
import { createElement } from "../utilities/create-element";

/**
 * Renames the canvas, in the file menu, since there's no button for it. The
 * name field is first, so it's what the popover focuses, with the name
 * selected to type over. Enter saves, and Escape or Cancel leaves it as it
 * was.
 */
export function renameItem(): FileMenuItem {
  return {
    name: "rename",
    label: "Rename",
    select: (host, opener) =>
      host.togglePopover({
        key: "rename",
        opener,
        render: () => {
          const form = createElement("form", "canvas-form canvas-rename");
          const title = createElement("p", "canvas-confirmation-message");
          title.textContent = "Rename canvas";
          const input = createElement("input", "canvas-text-input");
          input.type = "text";
          input.value = host.state.name;
          input.placeholder = UNTITLED_NAME;
          input.setAttribute("aria-label", "Canvas name");
          input.addEventListener("focus", () => input.select(), {
            once: true,
          });
          form.addEventListener("submit", (event) => {
            // It would otherwise submit a form the host mounted the canvas in.
            event.preventDefault();
            host.closePopover();
            host.actions.onRename(input.value.trim());
          });
          form.append(
            title,
            input,
            createFormButtons(host, createSubmitButton("Save"))
          );
          return form;
        },
      }),
  };
}
