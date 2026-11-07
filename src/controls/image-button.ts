import { type ToolbarControl } from "../models/toolbar-control.model";
import {
  checkIcon,
  createIconButton,
} from "../components/canvas-toolbar/toolbar-elements";

/** Inserts images from files. Images can also be pasted or dropped. */
export function imageButton(icon: Element): ToolbarControl {
  checkIcon(icon, "image");
  return {
    name: "image",
    mount: ({ closePopover, actions }) => {
      const button = createIconButton("Insert image", icon);
      button.addEventListener("click", () => {
        closePopover();
        actions.onInsertImage();
      });
      return { element: button };
    },
  };
}
