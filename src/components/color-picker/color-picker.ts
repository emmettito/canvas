import { type CustomColor } from "../../models/color.model";
import { createElement } from "../../utilities/create-element";
import { isCustomColor, readCssColor } from "../../utilities/colors";
import "./color-picker.css";

// A color to pick, as it's applied and as it's shown.
export interface Swatch {
  label: string;
  // What picking it applies, e.g. a palette color's CSS variable.
  value: string;
  // A CSS color to show it with.
  shown: string;
}

export interface ColorPickerOptions {
  swatches: Swatch[];
  // The value picked now, if any, which is shown as chosen.
  selected: string | null;
  // Custom colors picked before, most recent first.
  recent: CustomColor[];
  // `custom` is true for a color from outside the swatches.
  onPick: (value: string, custom: boolean) => void;
}

// The browser's own dropper, which picks from anywhere on screen. Only some
// browsers have it.
interface EyeDropperConstructor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

function getEyeDropper(): EyeDropperConstructor | undefined {
  return (window as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

// Buttons default to submitting a form, e.g. if the host mounts the canvas in
// one. Pressing them leaves focus where it is, e.g. in text being formatted.
function createButton(className: string, label: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

function createSwatches(
  swatches: Swatch[],
  selected: string | null,
  onPick: (value: string) => void
): HTMLDivElement {
  const grid = createElement("div", "canvas-color-grid");
  for (const { label, value, shown } of swatches) {
    const option = createButton("canvas-color-option", label);
    option.style.backgroundColor = shown;
    option.setAttribute("aria-pressed", String(value === selected));
    option.addEventListener("click", () => onPick(value));
    grid.append(option);
  }
  return grid;
}

/**
 * Swatches to pick from, the custom colors picked recently, and a custom
 * color, picked with the browser's picker, typed as any CSS color, e.g. hex
 * or "orange", or, where the browser can, picked from anywhere on screen.
 */
export function createColorPicker({
  swatches,
  selected,
  recent,
  onPick,
}: ColorPickerOptions): HTMLDivElement {
  const picker = createElement("div", "canvas-color-picker");
  picker.append(
    createSwatches(swatches, selected, (value) => onPick(value, false))
  );

  if (recent.length > 0) {
    const heading = createElement("p", "canvas-color-heading");
    heading.textContent = "Recent";
    picker.append(
      heading,
      createSwatches(
        recent.map((color) => ({ label: color, value: color, shown: color })),
        selected,
        (value) => onPick(value, true)
      )
    );
  }

  const custom = createElement("div", "canvas-color-custom");
  const current = isCustomColor(selected) ? selected : "#000000";
  // A swatch that opens the browser's color picker.
  const wheel = createElement("input", "canvas-color-input");
  wheel.type = "color";
  wheel.value = current;
  wheel.setAttribute("aria-label", "Custom color");
  wheel.title = "Custom color";
  wheel.addEventListener("change", () => onPick(wheel.value, true));
  // The color typed, e.g. hex from a brand guide, or a CSS name. It's kept
  // as hex.
  const hex = createElement("input", "canvas-text-input canvas-color-hex");
  hex.type = "text";
  hex.value = isCustomColor(selected) ? selected : "";
  hex.placeholder = "Hex or name";
  hex.spellcheck = false;
  hex.setAttribute("aria-label", "Color code");
  hex.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const color = readCssColor(hex.value);
    if (color) {
      onPick(color, true);
    } else {
      hex.setAttribute("aria-invalid", "true");
    }
  });
  hex.addEventListener("input", () => hex.removeAttribute("aria-invalid"));
  custom.append(wheel, hex);

  const EyeDropper = getEyeDropper();
  if (EyeDropper) {
    const pick = createButton(
      "canvas-button canvas-color-screen",
      "Pick from screen"
    );
    pick.textContent = "Pick from screen";
    pick.addEventListener("click", async () => {
      try {
        const { sRGBHex } = await new EyeDropper().open();
        onPick(sRGBHex.toLowerCase(), true);
      } catch {
        // Cancelled, e.g. with Escape.
      }
    });
    custom.append(pick);
  }
  picker.append(custom);
  return picker;
}
