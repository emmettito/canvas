import { type CustomColor, type ToolColor } from "@emmettito/canvas";
import { COLORS } from "../constants/colors.const";
import { getColorName } from "../utilities/get-color-name";
import { resolveColor } from "../utilities/resolve-color";
import {
  type ToolbarControl,
  type ToolbarHost,
} from "../models/toolbar-control.model";
import { type CanvasToolbarState } from "../components/canvas-toolbar/canvas-toolbar";
import {
  createButton,
  toCss,
} from "../components/canvas-toolbar/toolbar-elements";
import { createSwatchRow } from "../components/color-picker/color-picker";
import { createElement } from "../utilities/create-element";
import { createToolColorPicker, updateToolColor } from "./tool-color";

// What the color control shows and changes. The pencil always has a color.
// The fallback only satisfies the type.
function getColor(state: CanvasToolbarState): ToolColor {
  if (state.colorTarget === "note") {
    return state.noteColor;
  }
  if (state.colorTarget === "bucket") {
    return state.bucketColor;
  }
  return state.tools[state.colorTarget].color ?? COLORS[0];
}

// Picking a color while erasing goes back to the pencil.
function pickColor(host: ToolbarHost, color: ToolColor) {
  host.closePopover();
  const target = host.state.colorTarget;
  updateToolColor(host, target, color);
  if (target === "pencil" && host.state.activeTool === "eraser") {
    host.actions.onSelectTool("pencil");
  }
}

// The palette, then any color.
function createOptions(host: ToolbarHost): HTMLDivElement {
  const { state } = host;
  const options = createElement("div", "canvas-color-options");
  const swatches = createSwatchRow(
    "Colors",
    COLORS.map((color) => ({
      label: getColorName(color),
      value: color,
      shown: toCss(color),
    })),
    (value) => {
      host.actions.onUpdateColorFormat(host.state.colorTarget, "hex");
      pickColor(host, value as ToolColor);
    }
  );
  swatches.select(getColor(state));
  const picker = createToolColorPicker(
    host,
    resolveColor(host.element, getColor(state)) as CustomColor,
    (color) => updateToolColor(host, host.state.colorTarget, color),
    state.colorTarget
  );
  options.append(swatches.element, picker);
  options.dataset.canvasKeepsTyping = "";
  return options;
}

/**
 * Picks the color of the tool that's picked, or that was last: the pencil's,
 * which text uses too, the highlighter's, the bucket's, or new notes'. It
 * shows the color, so it takes no icon.
 */
export function colorControl(): ToolbarControl {
  return {
    name: "color",
    mount: (host) => {
      const button = createButton("canvas-toolbar-button");
      const swatch = createElement("span", "canvas-color-swatch");
      button.append(swatch);
      const popover = {
        key: "color",
        opener: button,
        render: () => createOptions(host),
      };
      // Pressing it leaves focus in text being typed, which it colors.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) =>
        // A click from the keyboard has no `detail`, and moves focus in.
        host.togglePopover(popover, event.detail === 0)
      );
      return {
        element: button,
        anchored: true,
        expands: true,
        update: (state) => {
          const color = getColor(state);
          const label = `Color: ${getColorName(color)}`;
          button.setAttribute("aria-label", label);
          button.dataset.tooltip = label;
          swatch.style.backgroundColor = toCss(color);
        },
      };
    },
  };
}
