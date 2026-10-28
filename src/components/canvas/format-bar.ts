import { COLORS } from "../../constants/colors.const";
import { FONTS } from "../../constants/fonts.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { type CustomColor } from "../../models/color.model";
import { type TextAlign } from "../../models/rich-text.model";
import { createElement } from "../../utilities/create-element";
import { getColorName } from "../../utilities/colors";
import { getCssVariable } from "../../utilities/get-css-variable";
import { createColorPicker } from "../color-picker/color-picker";
import {
  type Format,
  type TextFormatting,
  type ToggleMark,
} from "../../models/text-editor.model";

// The font sizes offered, in drawing units.
const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 96];

const TOGGLES: { mark: ToggleMark; label: string; text: string }[] = [
  { mark: "bold", label: "Bold", text: "B" },
  { mark: "italic", label: "Italic", text: "I" },
  { mark: "underline", label: "Underline", text: "U" },
  { mark: "strike", label: "Strikethrough", text: "S" },
];

// Each alignment's lines, as [x, width] out of 16, for its button's picture.
const ALIGNS: { align: TextAlign; label: string; lines: number[][] }[] = [
  {
    align: "left",
    label: "Align left",
    lines: [
      [2, 12],
      [2, 8],
      [2, 10],
    ],
  },
  {
    align: "center",
    label: "Align center",
    lines: [
      [2, 12],
      [4, 8],
      [3, 10],
    ],
  },
  {
    align: "right",
    label: "Align right",
    lines: [
      [2, 12],
      [6, 8],
      [4, 10],
    ],
  },
];

// Gap between the bar and the text it formats, and the canvas's edges.
const GAP = 8;

// Buttons default to submitting a form, e.g. if the host mounts the canvas in
// one. Pressing them leaves focus in the text, so typing carries on.
function createButton(className: string, label: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

// Lines like text's, for an alignment button.
function createAlignIcon(lines: number[][]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("canvas-icon");
  lines.forEach(([x, width], index) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    line.setAttribute("x", String(x));
    line.setAttribute("y", String(3 + index * 4));
    line.setAttribute("width", String(width));
    line.setAttribute("height", "1.5");
    line.setAttribute("rx", "0.75");
    line.setAttribute("fill", "currentColor");
    svg.append(line);
  });
  return svg;
}

/**
 * The formatting controls for the note or text being typed in: its font,
 * size, bold, italic, underline, line through, color and alignment. They
 * format the selected text, or what's typed next if nothing is selected.
 */
export class FormatBar {
  readonly element = createElement("div", "canvas-format-bar");
  #formatting: TextFormatting | null = null;
  // Returns focus to the text, e.g. once a menu's choice is made.
  #focusText: () => void = () => {};
  // The text's own size and color, which formatting goes back to.
  #defaults = { fontSize: TEXT_LAYOUT.defaultSize, color: "" };
  #font = createElement("select", "canvas-format-select");
  #size = createElement("select", "canvas-format-select");
  #toggles = new Map<ToggleMark, HTMLButtonElement>();
  #aligns = new Map<TextAlign, HTMLButtonElement>();
  #colorButton = createButton("canvas-toolbar-button", "Text color");
  #colorSwatch = createElement("span", "canvas-color-swatch");
  #colors = createElement("div", "canvas-format-colors");
  // What the palette's colors are read from, and the custom colors it offers
  // again.
  #root: Element | null = null;
  #recentColors: CustomColor[] = [];
  #onCustomColor: (color: CustomColor) => void;

  /** `onCustomColor` is told of each custom color picked, to offer again. */
  constructor(onCustomColor: (color: CustomColor) => void) {
    this.#onCustomColor = onCustomColor;
    const bar = this.element;
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Text formatting");
    bar.hidden = true;

    this.#font.setAttribute("aria-label", "Font");
    this.#font.append(new Option("Default", ""));
    for (const [name, { label, family }] of Object.entries(FONTS)) {
      const option = new Option(label, name);
      option.style.fontFamily = family;
      this.#font.append(option);
    }
    this.#font.addEventListener("change", () => {
      this.#formatting?.setValue("font", this.#font.value || undefined);
      this.#focusText();
    });

    this.#size.setAttribute("aria-label", "Font size");
    this.#size.addEventListener("change", () => {
      const size = Number(this.#size.value);
      // The text's own size is no formatting at all.
      this.#formatting?.setValue(
        "size",
        size === this.#defaults.fontSize ? undefined : size
      );
      this.#focusText();
    });

    const toggles = createElement("div", "canvas-toolbar-group");
    for (const { mark, label, text } of TOGGLES) {
      const button = createButton(
        `canvas-toolbar-button canvas-format-${mark}`,
        label
      );
      button.textContent = text;
      button.addEventListener("click", () => this.#formatting?.toggle(mark));
      this.#toggles.set(mark, button);
      toggles.append(button);
    }

    const color = createElement("div", "canvas-format-color");
    this.#colorButton.append(this.#colorSwatch);
    this.#colorButton.addEventListener("click", () => {
      // Made as it opens, with the color at the cursor chosen.
      if (this.#colors.hidden) {
        this.#colors.replaceChildren(this.#createColors());
      }
      this.#colors.hidden = !this.#colors.hidden;
      this.#colorButton.setAttribute(
        "aria-expanded",
        String(!this.#colors.hidden)
      );
    });
    this.#colors.hidden = true;
    color.append(this.#colorButton, this.#colors);

    const aligns = createElement("div", "canvas-toolbar-group");
    for (const { align, label, lines } of ALIGNS) {
      const button = createButton("canvas-toolbar-button", label);
      button.append(createAlignIcon(lines));
      button.addEventListener("click", () => this.#formatting?.setAlign(align));
      this.#aligns.set(align, button);
      aligns.append(button);
    }

    const fonts = createElement("div", "canvas-toolbar-group");
    fonts.append(this.#font, this.#size);
    toggles.append(color);
    bar.append(fonts, toggles, aligns);
    // Escape goes back to typing, e.g. from a menu.
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.#focusText();
      }
    });
  }

  /**
   * Shows the bar for the text `formatting` formats, whose own size and
   * color are `defaults`. `focusText` returns focus to the text. Each color is
   * read from `root`'s CSS variables.
   */
  open(
    formatting: TextFormatting,
    focusText: () => void,
    defaults: { fontSize: number; color: string },
    root: Element
  ): void {
    this.#formatting = formatting;
    this.#focusText = focusText;
    this.#defaults = defaults;
    this.#root = root;
    this.#colors.hidden = true;
    this.element.hidden = false;
    this.update();
  }

  close(): void {
    this.#formatting = null;
    this.element.hidden = true;
  }

  /** Shows the formatting at the cursor. */
  update(): void {
    const formatting = this.#formatting;
    if (!formatting) {
      return;
    }
    const format: Format = formatting.getFormat();
    for (const [mark, button] of this.#toggles) {
      button.setAttribute("aria-pressed", String(format[mark]));
    }
    for (const [align, button] of this.#aligns) {
      button.setAttribute("aria-pressed", String(format.align === align));
    }
    // A selection with more than one shows none.
    this.#font.value = format.font ?? "";
    if (format.font === null) {
      this.#font.selectedIndex = -1;
    }
    const size =
      format.size === null ? null : (format.size ?? this.#defaults.fontSize);
    this.#size.replaceChildren(
      ...[...new Set(size === null ? SIZES : [...SIZES, size])]
        .sort((a, b) => a - b)
        .map((value) => new Option(String(value), String(value)))
    );
    if (size === null) {
      this.#size.selectedIndex = -1;
    } else {
      this.#size.value = String(size);
    }
    const color =
      format.color === null ? null : (format.color ?? this.#defaults.color);
    this.#colorSwatch.style.backgroundColor = color ?? "transparent";
  }

  setRecentColors(colors: CustomColor[]): void {
    this.#recentColors = colors;
  }

  /**
   * Puts the bar above `target`, or below it if there's no room, inside
   * `bounds`. Both are rectangles on screen.
   */
  place(target: DOMRect, bounds: DOMRect): void {
    const bar = this.element;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    const above = target.top - bounds.top - GAP - height;
    const top = above >= GAP ? above : target.bottom - bounds.top + GAP;
    const left = Math.min(
      Math.max(target.left - bounds.left, GAP),
      Math.max(GAP, bounds.width - width - GAP)
    );
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
  }

  // The palette's colors, resolved, so text keeps its color if the theme
  // changes, like a stroke's.
  #createColors(): HTMLElement {
    const root = this.#root ?? document.documentElement;
    const color = this.#formatting?.getFormat().color;
    return createColorPicker({
      swatches: [
        // The text's own color, which is no formatting at all.
        { label: "Default", value: "", shown: this.#defaults.color },
        ...COLORS.map((palette) => {
          const value = getCssVariable(root, palette);
          return { label: getColorName(palette), value, shown: value };
        }),
      ],
      // None is chosen for a selection with more than one.
      selected: color === undefined ? "" : color,
      recent: this.#recentColors,
      onPick: (value, custom) => {
        this.#formatting?.setValue("color", value || undefined);
        if (custom) {
          this.#onCustomColor(value as CustomColor);
        }
        this.#colors.hidden = true;
        this.#colorButton.setAttribute("aria-expanded", "false");
        this.#focusText();
      },
    });
  }
}
