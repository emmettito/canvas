import { isCustomColor, type ToolColor } from "@emmettito/canvas";

/**
 * What the color's called, as its button and tooltip say, e.g. "Red", or
 * "#ff8800" for a custom one.
 */
export function getColorName(color: ToolColor): string {
  if (isCustomColor(color)) {
    return color;
  }
  const name = color.replace("--canvas-color-", "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
