import { type ToolbarControl } from "../models/toolbar-control.model";
import { createTextButton } from "../components/canvas-toolbar/toolbar-elements";

/**
 * The page's own text button, e.g. to open its settings. There can be any
 * number of them.
 */
export function customButton(
  label: string,
  onClick: () => void
): ToolbarControl {
  if (typeof label !== "string" || label === "") {
    throw new Error("A custom toolbar button needs a label.");
  }
  if (typeof onClick !== "function") {
    throw new Error(`The toolbar's "${label}" button needs an onClick.`);
  }
  return {
    name: null,
    mount: ({ closePopover }) => {
      const button = createTextButton();
      button.textContent = label;
      button.addEventListener("click", () => {
        closePopover();
        onClick();
      });
      return { element: button };
    },
  };
}
