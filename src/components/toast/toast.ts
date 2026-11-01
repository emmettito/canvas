import { TOAST_LAYOUT } from "../../constants/toast-layout.const";
import { createElement } from "../../utilities/create-element";
import "./toast.css";

/**
 * A short message at the bottom of the canvas, e.g. why something did
 * nothing, which fades out after a moment, like Figma's. It's always in the
 * page, so screen readers read each one.
 */
export class Toast {
  readonly element = createElement("div", "canvas-toast");
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.element.setAttribute("role", "status");
  }

  /** Shows `message`. Another, or the same again, starts the moment over. */
  show(message: string): void {
    this.element.textContent = message;
    this.element.toggleAttribute("data-shown", true);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(
      () => this.element.removeAttribute("data-shown"),
      TOAST_LAYOUT.duration
    );
  }

  destroy(): void {
    clearTimeout(this.#timer);
  }
}
