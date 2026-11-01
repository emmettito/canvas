import { createElement } from "../../utilities/create-element";
import "./dialog.css";

/**
 * Shows `content` in a dialog in the middle of the window, over everything,
 * which only it takes input until it closes. `parent` is what it's added to,
 * whose styles it uses. Escape, or pressing outside it, closes it, calling
 * `onClose`. Returns a function that removes it.
 */
export function showDialog(
  parent: HTMLElement,
  content: Node,
  onClose: () => void
): () => void {
  const dialog = createElement("dialog", "canvas-dialog");
  dialog.append(content);
  parent.append(dialog);
  dialog.showModal();
  // Escape closes it, which is left to whoever opened it.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    onClose();
  });
  // A press on the backdrop is on the dialog, outside its box.
  dialog.addEventListener("pointerdown", (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    ) {
      onClose();
    }
  });
  return () => {
    dialog.close();
    dialog.remove();
  };
}
