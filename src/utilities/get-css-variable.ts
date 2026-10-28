/** Reads the current value of a CSS variable defined on the root element. */
export function getCssVariable(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) {
    console.warn(`CSS variable ${name} is not defined.`);
  }
  return value;
}
