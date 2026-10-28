/** Reads the current value of a CSS variable as it applies to `element`. */
export function getCssVariable(element: Element, name: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  if (!value) {
    console.warn(`CSS variable ${name} is not defined.`);
  }
  return value;
}
