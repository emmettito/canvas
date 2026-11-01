import { LOUPE_LAYOUT } from "../../constants/loupe-layout.const";
import { type CustomColor } from "../../models/color.model";
import { type Point } from "../../models/point.model";
import { createElement } from "../../utilities/create-element";

const { pixels, pixelSize } = LOUPE_LAYOUT;

/**
 * The dropper's magnifier: the pixels around the pointer, enlarged, with the
 * one that's picked outlined in the middle, and its color around the edge
 * and as a code below.
 */
export class Loupe {
  readonly element = createElement("div", "canvas-loupe");
  #pixels = createElement("div", "canvas-loupe-pixels");
  #code = createElement("span", "canvas-loupe-code");
  // The pixels as they're sampled, one each, shown as an image, since a
  // canvas in the page would be taken for the drawing's.
  #image = createElement("canvas");

  constructor() {
    const element = this.element;
    element.setAttribute("aria-hidden", "true");
    element.hidden = true;
    element.style.setProperty("--canvas-loupe-pixels", String(pixels));
    element.style.setProperty("--canvas-loupe-pixel", `${pixelSize}px`);
    this.#image.width = pixels;
    this.#image.height = pixels;
    element.append(this.#pixels, this.#code);
  }

  // Whether it follows the pointer. It's only shown once it has pixels, so
  // it never shows what's under it unenlarged, or another place's pixels.
  #active = false;

  get active(): boolean {
    return this.#active;
  }

  get shown(): boolean {
    return !this.element.hidden;
  }

  /** Makes it follow the pointer, once it's shown somewhere. */
  start(): void {
    this.#active = true;
  }

  hide(): void {
    this.#active = false;
    this.element.hidden = true;
  }

  /**
   * Shows `data`, the pixels around `point`, `pixels` across, and `color`,
   * the one in the middle, centered on `point`, in pixels from the canvas's
   * top left. It's moved with its pixels, once they're decoded, so it never
   * shows another place's pixels, or none. Not if it's hidden meanwhile.
   */
  async show(data: ImageData, color: CustomColor, point: Point): Promise<void> {
    this.#image.getContext("2d")?.putImageData(data, 0, 0);
    const url = this.#image.toDataURL();
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      // Shown anyway, as soon as it can be.
    }
    if (!this.#active) {
      return;
    }
    this.#pixels.style.backgroundImage = `url(${url})`;
    this.element.style.setProperty("--canvas-loupe-color", color);
    // Written as the color picker writes hex.
    this.#code.textContent = color.toUpperCase();
    this.element.style.left = `${point.x}px`;
    this.element.style.top = `${point.y}px`;
    this.element.hidden = false;
  }
}
