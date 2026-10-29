/**
 * Wires up the demo page's background choices: radio buttons named
 * "background" in `picker`, whose values are colors, and a color input for any
 * other. Picking one calls `onPick`. Returns a function that shows the open
 * canvas's background, for `onBackgroundChange`.
 */
export function setUpBackgroundPicker(
  picker: HTMLElement,
  onPick: (color: string) => void
): (color: string) => void {
  const radios = [
    ...picker.querySelectorAll<HTMLInputElement>('input[name="background"]'),
  ];
  const customInput = picker.querySelector<HTMLInputElement>(
    'input[type="color"]'
  )!;
  const custom = customInput.closest<HTMLElement>(".demo-swatch")!;

  for (const radio of radios) {
    radio.addEventListener("change", () => onPick(radio.value));
  }
  // "change" fires once the color's chosen, rather than on every step while
  // it's dragged, so picking one is one undo.
  customInput.addEventListener("change", () => onPick(customInput.value));

  return (color) => {
    const value = color.toLowerCase();
    let offered = false;
    for (const radio of radios) {
      radio.checked = radio.value === value;
      offered ||= radio.checked;
    }
    // Any other color shows on the custom swatch, which opens on it.
    custom.toggleAttribute("data-selected", !offered);
    custom.style.setProperty("--swatch", offered ? "" : color);
    if (/^#[0-9a-f]{6}$/.test(value)) {
      customInput.value = value;
    }
  };
}
