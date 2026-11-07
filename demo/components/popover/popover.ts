import { createElement } from "../../utilities/create-element";
import "./popover.css";

// Minimum distance kept between the popover and the edges of the viewport.
const VIEWPORT_MARGIN = 8;

/**
 * Shows `content` floating above the button that opened it, or below it on a
 * toolbar at the top. The button's parent must be positioned. Returns a function that removes
 * the popover.
 */
export function showPopover(
  opener: HTMLElement,
  content: Node,
  onClose: () => void,
  takesFocus = true
): () => void {
  const popover = createElement("div", "canvas-popover");
  popover.append(content);
  opener.after(popover);

  // Shift back inside the viewport if its position pushes it past an edge.
  const { left, right } = popover.getBoundingClientRect();
  const viewportRight = document.documentElement.clientWidth - VIEWPORT_MARGIN;
  let shift = 0;
  if (left < VIEWPORT_MARGIN) {
    shift = VIEWPORT_MARGIN - left;
  } else if (right > viewportRight) {
    shift = viewportRight - right;
  }
  popover.style.setProperty("--popover-shift", `${shift}px`);

  // Move focus inside, preferring the selected option, so keyboard users can
  // reach the controls. Some leave it where it is, e.g. in text being typed.
  const target =
    popover.querySelector<HTMLElement>(
      '[aria-pressed="true"], input[type="radio"]:checked'
    ) ?? popover.querySelector<HTMLElement>("button:not(:disabled), input");
  if (takesFocus) {
    target?.focus();
  }

  popover.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    onClose();
    opener.focus();
  });

  return () => popover.remove();
}
