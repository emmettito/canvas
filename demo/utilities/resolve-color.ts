import { readCssColor, isCustomColor, type ToolColor } from "@emmettito/canvas";
import { getCssVariable } from "./get-css-variable";

/**
 * The color's value, read from `element`'s CSS if it's the palette's. That's
 * kept as "#rrggbb", however the stylesheet writes it, e.g. "red" for
 * "#ff0000" once it's minified, so what's drawn and exported doesn't depend
 * on it.
 */
export function resolveColor(element: Element, color: ToolColor): string {
  if (isCustomColor(color)) {
    return color;
  }
  const value = getCssVariable(element, color);
  return readCssColor(value) ?? value;
}
