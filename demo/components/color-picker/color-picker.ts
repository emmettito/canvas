import {
  type CustomColor,
  COLOR_FORMATS,
  type ColorFormat,
  formatColor,
  keepAlpha,
  readColor,
  splitAlpha,
  withAlpha,
} from "@emmettito/canvas";
import { createElement } from "../../utilities/create-element";
import { Dropdown } from "../dropdown/dropdown";
import "./color-picker.css";

// A color to pick, as it's applied and as it's shown.
export interface Swatch {
  label: string;
  // What picking it applies, e.g. a palette color's CSS variable.
  value: string;
  // A CSS color to show it with.
  shown: string;
}

// Buttons default to submitting a form, e.g. if the host mounts the canvas in
// one. Pressing them leaves focus where it is, e.g. in text being formatted.
function createButton(className: string, label: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

// The dropper, as the dropper tool's cursor shows it.
function createDropperIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("canvas-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L138.8,66.2a24,24,0,0,0-33.14.77l-5,5a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l5-5a24,24,0,0,0,.74-33.18l23.75-23.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34Z"
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

/**
 * A row of colors to pick from, as circles, the one picked ringed. Returns
 * the row, and a function that rings another.
 */
export function createSwatchRow(
  label: string,
  swatches: Swatch[],
  onPick: (value: string) => void
): { element: HTMLElement; select: (value: string | null) => void } {
  const row = createElement("div", "canvas-swatch-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  const options = swatches.map(({ label: name, value, shown }) => {
    const option = createButton("canvas-swatch", name);
    option.dataset.tooltip = name;
    const dot = createElement("span", "canvas-swatch-dot");
    dot.style.backgroundColor = shown;
    option.append(dot);
    option.addEventListener("click", () => onPick(value));
    row.append(option);
    return { value, option };
  });
  return {
    element: row,
    select: (selected) => {
      for (const { value, option } of options) {
        option.setAttribute("aria-pressed", String(value === selected));
      }
    },
  };
}

/**
 * A button showing a color, as a circle and written out, e.g. "#F27637", or
 * in another format, with how see-through it is after it. It opens the full
 * picker.
 */
export class ColorChip {
  readonly element = createButton("canvas-color-chip", "Custom color");
  #swatch = createElement("span", "canvas-color-chip-swatch");
  #text = createElement("span", "canvas-color-chip-text");

  constructor() {
    this.#swatch.setAttribute("aria-hidden", "true");
    this.element.append(this.#swatch, this.#text);
  }

  show(color: CustomColor, format: ColorFormat): void {
    const text = describeColor(color, format);
    this.#swatch.style.setProperty("--canvas-chip-color", color);
    this.#text.textContent = text;
    this.element.setAttribute("aria-label", `Custom color: ${text}`);
    this.element.dataset.tooltip = "Custom color";
  }
}

/** `color` in `format`, with how much of it shows after it, if not all. */
export function describeColor(color: CustomColor, format: ColorFormat): string {
  const { alpha } = splitAlpha(color);
  const written = formatColor(color, format);
  return alpha < 1 && format !== "css"
    ? `${written} · ${Math.round(alpha * 100)}%`
    : written;
}

export interface ColorPickerOptions {
  // The colors to pick from, as rows, top first, e.g. `getPaletteGrid`'s.
  grid: CustomColor[][];
  // The color picked now, which may be see-through. Null for none, e.g. a
  // selection with more than one.
  color: CustomColor | null;
  format: ColorFormat;
  // Custom colors picked before, most recent first.
  recent: CustomColor[];
  onPick: (color: CustomColor) => void;
  onFormat: (format: ColorFormat) => void;
  // Picks a color from the drawing, or the screen, e.g. with the dropper.
  // Without it, there's no dropper button.
  onDropper?: () => void;
  // Only solid colors are picked, without the opacity slider, e.g. for a
  // note, which strokes under it would show through.
  opaque?: boolean;
}

/**
 * Picks any color: from a grid of the palette's colors, lighter and darker,
 * or typed in any format, as see-through as the opacity slider says, or
 * again from the colors picked recently. It stays open, so a color can be
 * tried and changed.
 */
export function createColorPicker({
  grid: rows,
  color: initial,
  format: initialFormat,
  recent,
  onPick,
  onFormat,
  onDropper,
  opaque = false,
}: ColorPickerOptions): HTMLDivElement {
  const picker = createElement("div", "canvas-color-picker");
  let color = toPickable(initial ?? "#000000");
  let format = initialFormat;

  // The grid, which the arrow keys move through, with only the color picked,
  // or else the first, in the tab order.
  const grid = createElement("div", "canvas-color-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Colors");
  picker.style.setProperty("--canvas-grid-columns", String(rows[0].length));
  const cells = rows.flatMap((row, rowIndex) =>
    row.map((value, column) => {
      const cell = createButton("canvas-color-cell", value.toUpperCase());
      cell.style.backgroundColor = value;
      cell.tabIndex = -1;
      // A corner cell is as round as the grid's corner, so its frame, when
      // it's picked, follows it rather than being cut off.
      const last = row.length - 1;
      const bottom = rowIndex === rows.length - 1;
      if (rowIndex === 0 || bottom) {
        const side = rowIndex === 0 ? "Top" : "Bottom";
        if (column === 0) {
          cell.style[`border${side}LeftRadius`] = "8px";
        } else if (column === last) {
          cell.style[`border${side}RightRadius`] = "8px";
        }
      }
      cell.addEventListener("click", () => {
        // A color from the grid is written in hex, as it's shown here.
        setFormat("hex");
        commit(keepAlpha(value, color));
      });
      grid.append(cell);
      return { value, cell, row: rowIndex, column };
    })
  );
  grid.addEventListener("keydown", (event) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const step = steps[event.key];
    const at = cells.find(({ cell }) => cell === document.activeElement);
    if (!step || !at) {
      return;
    }
    event.preventDefault();
    cells
      .find(
        ({ row, column }) =>
          row === at.row + step[0] && column === at.column + step[1]
      )
      ?.cell.focus();
  });

  const opacityLabel = createElement("p", "canvas-color-heading");
  opacityLabel.textContent = "Opacity";
  const opacity = createElement("input", "canvas-opacity-slider");
  opacity.type = "range";
  // At 0% it couldn't be seen, which isn't a color to pick.
  opacity.min = "1";
  opacity.max = "100";
  opacity.setAttribute("aria-label", "Opacity");
  // Shown as it's dragged, and picked once it's let go.
  opacity.addEventListener("input", () =>
    show(withAlpha(color, Number(opacity.value) / 100))
  );
  opacity.addEventListener("change", () =>
    commit(withAlpha(color, Number(opacity.value) / 100))
  );

  const formats = new Dropdown<ColorFormat>({
    label: "Color format",
    options: COLOR_FORMATS,
    value: format,
    onSelect: (value) => {
      setFormat(value);
      show(color);
    },
  });
  formats.element.classList.add("canvas-color-format");

  const field = createElement("div", "canvas-color-field");
  const swatch = createElement("span", "canvas-color-field-swatch");
  swatch.setAttribute("aria-hidden", "true");
  const code = createElement("input", "canvas-color-code");
  code.type = "text";
  code.spellcheck = false;
  code.setAttribute("aria-label", "Color code");
  const percent = createElement("input", "canvas-color-percent");
  percent.type = "text";
  percent.inputMode = "numeric";
  percent.setAttribute("aria-label", "Opacity percent");
  // Typed colors are picked with Enter, or as focus leaves.
  const readCode = () => {
    const typed = readColor(code.value, format);
    if (!typed) {
      code.setAttribute("aria-invalid", "true");
      return;
    }
    // Only CSS says how see-through it is.
    commit(format === "css" ? typed : keepAlpha(typed, color));
  };
  const readPercent = () => {
    const value = Number(percent.value.replace("%", "").trim());
    if (percent.value.trim() === "" || !Number.isFinite(value)) {
      show(color);
      return;
    }
    commit(withAlpha(color, Math.min(Math.max(value, 1), 100) / 100));
  };
  for (const [input, read] of [
    [code, readCode],
    [percent, readPercent],
  ] as const) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        read();
      }
    });
    input.addEventListener("change", read);
    input.addEventListener("input", () =>
      input.removeAttribute("aria-invalid")
    );
    // Selected, so a new value can be typed over it. Safari puts the caret
    // where it's clicked as the button's released, after focus, so a click
    // into it selects it again then. Later clicks put the caret as usual.
    let clickedIn = false;
    input.addEventListener("mousedown", () => {
      clickedIn = document.activeElement !== input;
    });
    input.addEventListener("mouseup", (event) => {
      if (clickedIn) {
        clickedIn = false;
        event.preventDefault();
        input.select();
      }
    });
    input.addEventListener("focus", () => input.select());
  }
  field.append(swatch, code);
  if (!opaque) {
    field.append(percent);
  }
  const fields = createElement("div", "canvas-color-fields");
  fields.append(formats.element, field);
  if (onDropper) {
    const dropper = createButton("canvas-color-dropper", "Pick a color");
    dropper.title = "Pick a color";
    dropper.append(createDropperIcon());
    dropper.addEventListener("click", onDropper);
    fields.append(dropper);
  }

  picker.append(grid);
  if (!opaque) {
    picker.append(opacityLabel, opacity);
  }
  picker.append(fields);

  if (recent.length > 0) {
    const heading = createElement("p", "canvas-color-heading");
    heading.textContent = "Recent";
    const row = createSwatchRow(
      "Recent colors",
      recent.map((value) => ({ label: value, value, shown: value })),
      (value) => commit(value as CustomColor)
    );
    picker.append(heading, row.element);
  }

  function setFormat(value: ColorFormat) {
    if (value !== format) {
      format = value;
      formats.update(value);
      onFormat(value);
    }
  }

  function commit(value: CustomColor) {
    color = toPickable(value);
    show(color);
    onPick(color);
  }

  // `value` as it can be picked here: solid, if it must be.
  function toPickable(value: CustomColor): CustomColor {
    return opaque ? withAlpha(value, 1) : value;
  }

  // Shows `value` everywhere in the picker, e.g. while the slider's dragged.
  function show(value: CustomColor) {
    const { solid, alpha } = splitAlpha(value);
    const picked = solid.toLowerCase();
    let focusable = cells.find(({ value: each }) => each === picked);
    for (const each of cells) {
      each.cell.setAttribute("aria-pressed", String(each === focusable));
    }
    focusable ??= cells[0];
    for (const each of cells) {
      each.cell.tabIndex = each === focusable ? 0 : -1;
    }
    picker.style.setProperty("--canvas-picked-solid", solid);
    picker.style.setProperty("--canvas-picked", value);
    opacity.value = String(Math.round(alpha * 100));
    code.value = formatColor(value, format);
    code.removeAttribute("aria-invalid");
    percent.value = `${Math.round(alpha * 100)}%`;
  }

  show(color);
  if (!initial) {
    code.value = "";
  }
  // Typing a color code here doesn't stop typing text, which it colors.
  picker.dataset.canvasKeepsTyping = "";
  return picker;
}
