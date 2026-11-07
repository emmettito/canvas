import {
  FONTS,
  TEXT_LAYOUT,
  type CustomColor,
  type FontName,
  type ListType,
  type TextAlign,
  type ColorFormat,
  readColorWithAlpha,
  readCssColor,
  toLinkAddress,
} from "@emmettito/canvas";
import { COLORS } from "../../constants/colors.const";
import { getColorName } from "../../utilities/get-color-name";
import { resolveColor } from "../../utilities/resolve-color";
import { createElement } from "../../utilities/create-element";
import { getPaletteGrid } from "../../utilities/palette-grid";
import {
  ColorChip,
  createColorPicker,
  createSwatchRow,
} from "../color-picker/color-picker";
import { Dropdown, type DropdownOption } from "../dropdown/dropdown";
import {
  type Format,
  type TextFormatting,
  type ToggleMark,
} from "../../models/text-editor.model";

// The sizes offered, as multiples of the text's own size, which is Medium.
const SIZES: { label: string; scale: number; shown: string }[] = [
  { label: "Small", scale: 0.75, shown: "13px" },
  { label: "Medium", scale: 1, shown: "15px" },
  { label: "Large", scale: 1.5, shown: "19px" },
];

// The largest size that can be typed in, in drawing units.
const MAX_SIZE = 400;

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

const LISTS: { list: ListType; label: string; shortcut: string }[] = [
  { list: "bullet", label: "Bulleted list", shortcut: "8" },
  { list: "ordered", label: "Numbered list", shortcut: "7" },
];

// Gap between the bar and the text it formats, and the canvas's edges.
const GAP = 8;

const SVG = "http://www.w3.org/2000/svg";

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

function createIcon(...children: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("canvas-icon");
  svg.append(...children);
  return svg;
}

function createShape(
  name: string,
  attributes: Record<string, string | number>
): SVGElement {
  const shape = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    shape.setAttribute(key, String(value));
  }
  return shape;
}

// Lines like text's, for an alignment button.
function createAlignIcon(lines: number[][]): SVGSVGElement {
  return createIcon(
    ...lines.map(([x, width], index) =>
      createShape("rect", {
        x,
        y: 3 + index * 4,
        width,
        height: 1.5,
        rx: 0.75,
        fill: "currentColor",
      })
    )
  );
}

// Three lines, each after a bullet or a number.
function createListIcon(list: ListType): SVGSVGElement {
  return createIcon(
    ...[0, 1, 2].flatMap((index) => {
      const y = 3.5 + index * 4.5;
      return [
        list === "bullet"
          ? createShape("circle", {
              cx: 2.75,
              cy: y,
              r: 1.25,
              fill: "currentColor",
            })
          : createShape("text", {
              x: 0.75,
              y: y + 1.9,
              "font-size": 5.5,
              "font-family": "system-ui, sans-serif",
              "font-weight": 600,
              fill: "currentColor",
            }),
        createShape("rect", {
          x: 6,
          y: y - 0.75,
          width: 9,
          height: 1.5,
          rx: 0.75,
          fill: "currentColor",
        }),
      ].map((shape) => {
        if (shape.tagName === "text") {
          shape.textContent = String(index + 1);
        }
        return shape;
      });
    })
  );
}

// Two links of a chain.
function createLinkIcon(): SVGSVGElement {
  return createIcon(
    createShape("path", {
      d: "M7 9a2.6 2.6 0 0 0 3.7 0l2.6-2.6a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9 7a2.6 2.6 0 0 0-3.7 0L2.7 9.6a2.6 2.6 0 0 0 3.7 3.7l.8-.8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
}

// What opens below the bar: the colors, or a link's address.
type Panel = "colors" | "link";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

// The browser's own dropper, which picks from anywhere on screen. Only some
// browsers have it, e.g. Chrome and Edge.
const EyeDropper = (
  window as {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
).EyeDropper;

/**
 * The formatting controls for the note or text being typed in: its font,
 * size, bold, italic, underline, line through, color, link, lists and
 * alignment. They format the selected text, or what's typed next if nothing
 * is selected.
 */
export class FormatBar {
  readonly element = createElement("div", "canvas-format-bar");
  #formatting: TextFormatting | null = null;
  // Returns focus to the text, e.g. once a menu's choice is made.
  #focusText: () => void = () => {};
  // The text's own size and color, which formatting goes back to.
  #defaults = { fontSize: TEXT_LAYOUT.defaultSize, color: "" };
  #font: Dropdown<FontName | "">;
  #size: Dropdown<number>;
  #sizeInput = createElement("input", "canvas-text-input");
  #toggles = new Map<ToggleMark, HTMLButtonElement>();
  #aligns = new Map<TextAlign, HTMLButtonElement>();
  #lists = new Map<ListType, HTMLButtonElement>();
  #colorButton = createButton("canvas-toolbar-button", "Text color");
  #colorSwatch = createElement("span", "canvas-color-swatch");
  #linkButton = createButton("canvas-toolbar-button", "Link");
  // The colors or link being changed, below the bar, while it's open.
  #panel = createElement("div", "canvas-format-panel");
  #openPanel: Panel | null = null;
  // What the palette's colors are read from.
  #root: Element | null = null;
  // What the bar and its panel are kept inside, on screen.
  #bounds: DOMRect | null = null;
  #recentColors: CustomColor[] = [];
  #colorFormat: ColorFormat = "hex";
  #onCustomColor: (color: CustomColor) => void;
  #onColorFormat: (format: ColorFormat) => void;

  /**
   * `onCustomColor` is told of each custom color picked, to offer again, and
   * `onColorFormat` of the format custom colors are written in.
   */
  constructor(
    onCustomColor: (color: CustomColor) => void,
    onColorFormat: (format: ColorFormat) => void
  ) {
    this.#onCustomColor = onCustomColor;
    this.#onColorFormat = onColorFormat;
    const bar = this.element;
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Text formatting");
    bar.hidden = true;

    this.#font = new Dropdown<FontName | "">({
      label: "Font",
      options: [
        { value: "", label: "Default" },
        ...Object.entries(FONTS).map(([name, { label, family }]) => ({
          value: name as FontName,
          label,
          style: { fontFamily: family },
        })),
      ],
      value: "",
      describe: () => "Mixed",
      keepsFocus: true,
      onSelect: (value) => {
        this.#formatting?.setValue("font", value || undefined);
        this.#focusText();
      },
    });
    this.#font.element.classList.add("canvas-format-font");

    // A size typed in, for one that isn't offered.
    const sizeInput = this.#sizeInput;
    sizeInput.type = "text";
    sizeInput.inputMode = "numeric";
    // Empty for a selection with more than one size.
    sizeInput.placeholder = "Custom size";
    sizeInput.setAttribute("aria-label", "Custom font size");
    this.#size = new Dropdown<number>({
      label: "Font size",
      options: [],
      value: null,
      describe: (value) => (value === null ? "Mixed" : String(value)),
      keepsFocus: true,
      onSelect: (size) => this.#setSize(size),
      // Made each time the menu opens, so the field's listeners aren't here.
      footer: () => {
        const footer = createElement(
          "div",
          "canvas-dropdown-footer canvas-size-field"
        );
        footer.append(sizeInput);
        return footer;
      },
    });
    sizeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const size = Number(sizeInput.value.trim());
      if (size > 0 && size <= MAX_SIZE) {
        // Focus goes back to the text before the field goes, so typing
        // doesn't stop.
        this.#setSize(size);
        this.#size.close();
      } else {
        sizeInput.setAttribute("aria-invalid", "true");
      }
    });
    sizeInput.addEventListener("input", () =>
      sizeInput.removeAttribute("aria-invalid")
    );
    sizeInput.addEventListener("focus", () => sizeInput.select());
    this.#size.element.classList.add("canvas-format-size");

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

    this.#colorButton.append(this.#colorSwatch);
    this.#colorButton.addEventListener("click", () =>
      this.#togglePanel("colors")
    );
    this.#linkButton.append(createLinkIcon());
    this.#linkButton.addEventListener("click", () => this.#togglePanel("link"));
    toggles.append(this.#colorButton, this.#linkButton);

    const lists = createElement("div", "canvas-toolbar-group");
    for (const { list, label, shortcut } of LISTS) {
      const button = createButton(
        "canvas-toolbar-button",
        `${label} (${IS_MAC ? "⌘⇧" : "Ctrl+Shift+"}${shortcut})`
      );
      button.setAttribute("aria-label", label);
      button.append(createListIcon(list));
      button.addEventListener("click", () => this.#formatting?.setList(list));
      this.#lists.set(list, button);
      lists.append(button);
    }

    const aligns = createElement("div", "canvas-toolbar-group");
    for (const { align, label, lines } of ALIGNS) {
      const button = createButton("canvas-toolbar-button", label);
      button.append(createAlignIcon(lines));
      button.addEventListener("click", () => this.#formatting?.setAlign(align));
      this.#aligns.set(align, button);
      aligns.append(button);
    }

    const fonts = createElement("div", "canvas-toolbar-group");
    fonts.append(this.#font.element, this.#size.element);
    this.#panel.hidden = true;
    bar.append(fonts, toggles, lists, aligns, this.#panel);
    // Escape goes back to typing, e.g. from a panel.
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        // Focus goes back to the text before the panel goes, so typing
        // doesn't stop.
        this.#focusText();
        this.#closePanel();
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
    this.#closePanel();
    this.element.hidden = false;
    this.update();
  }

  close(): void {
    this.#formatting = null;
    this.#closePanel();
    this.#font.close();
    this.#size.close();
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
    for (const [list, button] of this.#lists) {
      button.setAttribute("aria-pressed", String(format.list === list));
    }
    this.#linkButton.setAttribute("aria-pressed", String(Boolean(format.link)));
    // A selection with more than one shows none.
    this.#font.update(format.font === null ? null : (format.font ?? ""));
    const own = this.#defaults.fontSize;
    const size = format.size === null ? null : (format.size ?? own);
    const options: DropdownOption<number>[] = SIZES.map(
      ({ label, scale, shown }) => ({
        value: Math.round(own * scale),
        label,
        style: { fontSize: shown },
      })
    );
    this.#size.update(size, options);
    this.#sizeInput.value = size === null ? "" : String(size);
    const color =
      format.color === null ? null : (format.color ?? this.#defaults.color);
    this.#colorSwatch.style.backgroundColor = color ?? "transparent";
  }

  /** The custom colors to offer again, and how they're written. */
  setColorSettings(recent: CustomColor[], format: ColorFormat): void {
    this.#recentColors = recent;
    this.#colorFormat = format;
  }

  /**
   * Puts the bar above `target`, centered on it, or below it if there's no
   * room, inside `bounds`. Both are rectangles on screen.
   */
  place(target: DOMRect, bounds: DOMRect): void {
    const bar = this.element;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    const above = target.top - bounds.top - GAP - height;
    const top = above >= GAP ? above : target.bottom - bounds.top + GAP;
    // Centered on the text, as far as it fits.
    const center = target.left - bounds.left + target.width / 2;
    const left = Math.min(
      Math.max(center - width / 2, GAP),
      Math.max(GAP, bounds.width - width - GAP)
    );
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    this.#bounds = bounds;
    this.#placePanel();
  }

  // The text's own size is no formatting at all.
  #setSize(size: number): void {
    this.#formatting?.setValue(
      "size",
      size === this.#defaults.fontSize ? undefined : size
    );
    this.#focusText();
  }

  #togglePanel(panel: Panel): void {
    const wasOpen = this.#openPanel === panel;
    this.#closePanel();
    if (wasOpen) {
      return;
    }
    this.#openPanel = panel;
    this.#panel.replaceChildren(
      panel === "colors" ? this.#createColors() : this.#createLinkForm()
    );
    this.#panel.hidden = false;
    (panel === "colors" ? this.#colorButton : this.#linkButton).setAttribute(
      "aria-expanded",
      "true"
    );
    this.#placePanel();
    if (panel === "link") {
      this.#panel.querySelector("input")?.focus();
    }
  }

  #closePanel(): void {
    this.#openPanel = null;
    this.#panel.hidden = true;
    this.#panel.replaceChildren();
    this.#colorButton.setAttribute("aria-expanded", "false");
    this.#linkButton.setAttribute("aria-expanded", "false");
  }

  // Opens the panel below the bar, or above it if it'd be cut off below and
  // there's more room above, and moves it sideways to fit.
  #placePanel(): void {
    const panel = this.#panel;
    const bounds = this.#bounds;
    if (panel.hidden || !bounds) {
      return;
    }
    panel.removeAttribute("data-above");
    panel.style.removeProperty("--panel-shift");
    const bar = this.element.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    const roomAbove = bar.top - bounds.top;
    const roomBelow = bounds.bottom - bar.bottom;
    if (rect.bottom > bounds.bottom - GAP && roomAbove > roomBelow) {
      panel.toggleAttribute("data-above", true);
    }
    let shift = 0;
    if (rect.left < bounds.left + GAP) {
      shift = bounds.left + GAP - rect.left;
    } else if (rect.right > bounds.right - GAP) {
      shift = bounds.right - GAP - rect.right;
    }
    panel.style.setProperty("--panel-shift", `${shift}px`);
  }

  // The palette's colors in a row, resolved, so text keeps its color if the
  // theme changes, like a stroke's, then the color picked, which opens the
  // picker for any color in its place. The text's own color is no formatting
  // at all, so picking it removes any.
  #createColors(): HTMLElement {
    const root = this.#root ?? document.documentElement;
    const format = this.#formatting?.getFormat().color;
    const own = readCssColor(this.#defaults.color);
    const pick = (value: string) =>
      this.#formatting?.setValue(
        "color",
        readColorWithAlpha(value) === own ? undefined : value
      );
    const swatches = COLORS.map((palette) => {
      const value = resolveColor(root, palette);
      return { label: getColorName(palette), value, shown: value };
    });
    // The color shown, as hex. None for a selection with more than one.
    const shown =
      format === null
        ? null
        : readColorWithAlpha(format ?? this.#defaults.color);
    const row = createSwatchRow("Text color", swatches, (value) => {
      pick(value);
      this.#onColorFormat("hex");
      // Focus goes back to the text before the panel goes, so typing
      // doesn't stop.
      this.#focusText();
      this.#closePanel();
    });
    row.select(
      shown &&
        (swatches.find(({ value }) => readColorWithAlpha(value) === shown)
          ?.value ??
          null)
    );
    const colors = createElement("div", "canvas-format-colors");
    const chip = new ColorChip();
    if (shown) {
      chip.show(shown, this.#colorFormat);
    }
    chip.element.addEventListener("click", () => {
      colors.replaceChildren(
        createColorPicker({
          grid: getPaletteGrid(root),
          color: shown,
          format: this.#colorFormat,
          recent: this.#recentColors,
          onPick: (color) => {
            pick(color);
            this.#onCustomColor(color);
          },
          onFormat: (value) => {
            this.#colorFormat = value;
            this.#onColorFormat(value);
          },
          // Pressing the drawing would stop typing, so text's color is picked
          // with the browser's dropper, from anywhere on screen, where the
          // browser has one.
          ...(EyeDropper && {
            onDropper: async () => {
              try {
                const { sRGBHex } = await new EyeDropper().open();
                const color = readColorWithAlpha(sRGBHex);
                if (color) {
                  pick(color);
                  this.#onCustomColor(color);
                  this.#closePanel();
                }
              } catch {
                // Cancelled, e.g. with Escape.
              }
              this.#focusText();
            },
          }),
        })
      );
      this.#placePanel();
    });
    colors.append(row.element, chip.element);
    return colors;
  }

  // Where the selection, or the link at the cursor, links to. Enter links
  // it, and Remove unlinks it.
  #createLinkForm(): HTMLElement {
    const current = this.#formatting?.getFormat().link;
    const form = createElement("div", "canvas-format-link");
    const input = createElement("input", "canvas-text-input");
    input.type = "url";
    input.value = current ?? "";
    input.placeholder = "Paste or type a link";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Link address");
    const apply = createButton(
      "canvas-button canvas-button-primary",
      "Apply link"
    );
    apply.textContent = "Link";
    const submit = () => {
      const href = toLinkAddress(input.value);
      if (!href) {
        input.setAttribute("aria-invalid", "true");
        return;
      }
      this.#formatting?.setLink(href);
      // Focus goes back to the text before the panel goes, so typing
      // doesn't stop.
      this.#focusText();
      this.#closePanel();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    input.addEventListener("input", () =>
      input.removeAttribute("aria-invalid")
    );
    apply.addEventListener("click", submit);
    form.append(input, apply);
    if (current) {
      const remove = createButton("canvas-button", "Remove link");
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        this.#formatting?.setLink(undefined);
        // Focus goes back to the text before the panel goes, so typing
        // doesn't stop.
        this.#focusText();
        this.#closePanel();
      });
      form.append(remove);
    }
    return form;
  }
}
