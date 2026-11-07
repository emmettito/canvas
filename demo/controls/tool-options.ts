import {
  type CustomColor,
  type PaletteColor,
  isCustomColor,
} from "@emmettito/canvas";
import { COLORS } from "../constants/colors.const";
import { type Color } from "../models/color.model";
import { getColorName } from "../utilities/get-color-name";
import { resolveColor } from "../utilities/resolve-color";
import { TOOL_SIZE_LABELS, TOOL_SIZES } from "../constants/tool-sizes.const";
import {
  type ToolbarHost,
  type ToolbarPopover,
  type ToolOptions,
} from "../models/toolbar-control.model";
import {
  type CanvasToolbarState,
  type ColorTarget,
} from "../components/canvas-toolbar/canvas-toolbar";
import {
  createButton,
  toCss,
} from "../components/canvas-toolbar/toolbar-elements";
import {
  ColorChip,
  createSwatchRow,
} from "../components/color-picker/color-picker";
import { createElement } from "../utilities/create-element";
import { getNoteShade } from "../utilities/palette-grid";
import { createToolColorPicker, updateToolColor } from "./tool-color";

/** The tools with options of their own. */
export type OptionsTool =
  | "pencil"
  | "highlighter"
  | "eraser"
  | "bucket"
  | "note";

const SVG = "http://www.w3.org/2000/svg";

// How thick each size's squiggle is drawn, thin to thick.
const SQUIGGLE_WIDTHS = [1.5, 2.75, 4.5];

// A squiggle drawn `width` wide, as a size's button shows it, with square
// ends for the highlighter, which draws them.
function createSquiggle(width: number, square: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("canvas-icon", "canvas-squiggle");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M4 16c2-6 4.5-8.5 6.5-5.5s3 6 5.5 3S19 8 20 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", String(width));
  path.setAttribute("stroke-linecap", square ? "square" : "round");
  path.setAttribute("stroke-linejoin", square ? "bevel" : "round");
  svg.append(path);
  return svg;
}

// The tool whose color an options tool's colors pick.
function getColorTool(tool: OptionsTool): ColorTarget | null {
  return tool === "eraser" ? null : tool;
}

/**
 * The options `tool` shows in a smaller bar of its own while it's picked:
 * the stroke tools' sizes, as squiggles, then the colors of the pencil,
 * highlighter, paint bucket and notes, from the palette, and the color
 * picked, which opens the picker for any color.
 */
export function createToolOptions(
  tool: OptionsTool
): (host: ToolbarHost, bar: HTMLElement) => ToolOptions {
  return (host, bar) => {
    const { actions } = host;
    const sizeButtons = new Map<number, HTMLButtonElement>();
    // A light shade of a palette color, for a note.
    const noteShade = (color: PaletteColor) =>
      getNoteShade(host.element, color);

    if (tool !== "note" && tool !== "bucket") {
      const sizes = createElement("div", "canvas-toolbar-group");
      sizes.setAttribute("role", "group");
      sizes.setAttribute("aria-label", "Size");
      TOOL_SIZES[tool].forEach((size, index) => {
        const button = createButton("canvas-toolbar-button");
        const label = TOOL_SIZE_LABELS[index];
        button.setAttribute("aria-label", label);
        button.dataset.tooltip = label;
        button.append(
          createSquiggle(SQUIGGLE_WIDTHS[index], tool === "highlighter")
        );
        // Pressing it leaves focus where it is, e.g. on the canvas.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () =>
          actions.onUpdateTool(tool, { size })
        );
        sizeButtons.set(size, button);
        sizes.append(button);
      });
      bar.append(sizes);
    }

    // The color the options show for the tool: the palette's color, or the
    // custom one, that's picked, and the color it is. A note's palette
    // colors are a light shade of them. While a note's typed in, its own
    // color shows. `target` is whose color it is.
    const getShown = (
      state: CanvasToolbarState
    ): { selected: string; color: CustomColor; target: ColorTarget } | null => {
      if (tool === "note") {
        const typing = state.typingNoteColor;
        if (typing) {
          const palette = COLORS.find((color) => noteShade(color) === typing);
          return {
            selected: palette ?? typing,
            color: typing as CustomColor,
            target: "note",
          };
        }
        const { noteColor } = state;
        return {
          selected: noteColor,
          color: isCustomColor(noteColor)
            ? noteColor
            : (noteShade(noteColor) as CustomColor),
          target: "note",
        };
      }
      const stroke = getColorTool(tool);
      if (!stroke || stroke === "note") {
        return null;
      }
      const color =
        stroke === "bucket" ? state.bucketColor : state.tools[stroke].color;
      return color
        ? {
            selected: color,
            color: resolveColor(host.element, color) as CustomColor,
            target: stroke,
          }
        : null;
    };

    const colorTool = getColorTool(tool);
    let selectSwatch: ((value: string | null) => void) | null = null;
    let chip: ColorChip | null = null;
    let picker: ToolbarPopover | null = null;
    if (colorTool) {
      const colors = createElement("div", "canvas-toolbar-group");
      const swatches = createSwatchRow(
        "Colors",
        COLORS.map((color) => ({
          label: getColorName(color),
          value: color,
          shown: tool === "note" ? noteShade(color) : toCss(color),
        })),
        (value) => {
          // Picking one puts the picker away. A palette color is written in
          // hex, as the palette is.
          if (picker && host.openPopover?.key === picker.key) {
            host.closePopover();
          }
          actions.onUpdateColorFormat(colorTool, "hex");
          updateToolColor(host, colorTool, value as Color);
        }
      );
      selectSwatch = swatches.select;
      const colorChip = new ColorChip();
      chip = colorChip;
      // Any color. A note is the color picked, rather than a light shade of
      // it, as its palette colors are.
      const popover: ToolbarPopover = {
        key: "custom-color",
        opener: colorChip.element,
        render: () =>
          createToolColorPicker(
            host,
            getShown(host.state)?.color ?? "#000000",
            (color) => updateToolColor(host, colorTool, color),
            colorTool
          ),
      };
      picker = popover;
      colorChip.element.addEventListener("click", (event) =>
        // A click from the keyboard has no `detail`, and moves focus in.
        host.togglePopover(popover, event.detail === 0)
      );
      const anchor = createElement("div", "canvas-toolbar-item");
      anchor.append(colorChip.element);
      colors.append(swatches.element, anchor);
      bar.append(colors);
    }

    return {
      update: (state) => {
        if (tool !== "note" && tool !== "bucket") {
          for (const [size, button] of sizeButtons) {
            button.setAttribute(
              "aria-pressed",
              String(size === state.tools[tool].size)
            );
          }
        }
        const shown = getShown(state);
        if (shown) {
          selectSwatch?.(shown.selected);
          chip?.show(shown.color, state.colorFormats[shown.target]);
          chip?.element.setAttribute(
            "aria-expanded",
            String(host.openPopover?.key === "custom-color")
          );
        }
      },
    };
  };
}
