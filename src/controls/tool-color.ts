// Picking a tool's color, which the color control and the tools' options
// both do.
import { type CustomColor, type ToolColor } from "../models/color.model";
import { type ToolbarHost } from "../models/toolbar-control.model";
import { type ColorTarget } from "../components/canvas-toolbar/canvas-toolbar";
import { createColorPicker } from "../components/color-picker/color-picker";
import { getPaletteGrid } from "../utilities/palette-grid";

/** Gives `target` its new color. */
export function updateToolColor(
  { actions }: ToolbarHost,
  target: ColorTarget,
  color: ToolColor
): void {
  if (target === "note") {
    actions.onUpdateNoteColor(color);
  } else if (target === "bucket") {
    actions.onUpdateBucketColor(color);
  } else {
    actions.onUpdateTool(target, { color });
  }
}

/**
 * The full color picker for `target`'s color, starting from `color`, which
 * picks with `onPick`. A note's is only solid colors.
 */
export function createToolColorPicker(
  host: ToolbarHost,
  color: CustomColor,
  onPick: (color: CustomColor) => void,
  target: ColorTarget
): HTMLDivElement {
  const { actions, state } = host;
  return createColorPicker({
    grid: getPaletteGrid(host.element),
    color,
    format: state.colorFormats[target],
    recent: state.recentColors,
    onPick,
    opaque: target === "note",
    onFormat: (format) => actions.onUpdateColorFormat(target, format),
    // The dropper picks a color from the drawing for whichever tool the
    // picker's for, then goes back to it.
    onDropper: () => {
      host.closePopover();
      if (host.state.activeTool !== "dropper") {
        actions.onSelectTool("dropper");
      }
    },
  });
}
