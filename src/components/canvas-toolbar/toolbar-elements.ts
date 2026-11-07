// What the toolbar and its controls are made of.
import { type ToolColor } from "../../models/color.model";
import { type ToolbarHost } from "../../models/toolbar-control.model";
import { isCustomColor } from "../../utilities/colors";
import { createElement } from "../../utilities/create-element";

// Shortcuts use Cmd on a Mac, and Ctrl elsewhere.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const MOD = IS_MAC ? "⌘" : "Ctrl+";
export const SHIFT = IS_MAC ? "⇧" : "Shift+";

/** A key a button's shortcut is, as it's shown and as screen readers have it. */
export interface Shortcut {
  shown: string;
  aria: string;
}

/** A tool's key, e.g. "Shift+M", as its button shows it. */
export function getToolShortcut(key: string): Shortcut {
  return { shown: key.replace("Shift+", SHIFT), aria: key };
}

/** Ctrl and `key`, or Cmd on a Mac, with Shift if `shift`. */
export function getModShortcut(key: string, shift = false): Shortcut {
  return {
    shown: `${MOD}${shift ? SHIFT : ""}${key}`,
    aria: `${IS_MAC ? "Meta" : "Control"}+${shift ? "Shift+" : ""}${key}`,
  };
}

// Buttons default to submitting a form, e.g. if the host mounts the canvas in one.
export function createButton(className: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  return button;
}

/** A text button on a toolbar, e.g. the zoom's. */
export function createTextButton(className = ""): HTMLButtonElement {
  return createButton(
    `canvas-toolbar-button canvas-toolbar-text-button ${className}`.trim()
  );
}

/**
 * A button named `label` with a copy of the host page's `icon`, so the same
 * one can be used again. Its key, if it has one, is shown after its name.
 */
export function createIconButton(
  label: string,
  icon: Element,
  shortcut?: Shortcut
): HTMLButtonElement {
  const button = createButton("canvas-toolbar-button");
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
  if (shortcut) {
    button.dataset.shortcut = shortcut.shown;
    button.setAttribute("aria-keyshortcuts", shortcut.aria);
  }
  const copy = icon.cloneNode(true) as Element;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("canvas-icon");
  button.append(copy);
  return button;
}

/** Throws unless `icon` is an element, e.g. an `<svg>`. */
export function checkIcon(icon: unknown, name: string): Element {
  if (!(icon instanceof Element)) {
    throw new Error(`The toolbar's "${name}" button needs an icon.`);
  }
  return icon;
}

// A CSS color to show a tool's color with.
export function toCss(color: ToolColor): string {
  return isCustomColor(color) ? color : `var(${color})`;
}

interface SegmentOption {
  value: string;
  label: string;
  checked: boolean;
}

/** Radio buttons, named `name`, that look like a row of joined buttons. */
export function createSegmented(
  legend: string,
  name: string,
  options: SegmentOption[]
): HTMLFieldSetElement {
  const field = createElement("fieldset", "canvas-field");
  const title = createElement("legend", "canvas-field-legend");
  title.textContent = legend;
  const segments = createElement("div", "canvas-segmented");
  for (const { value, label, checked } of options) {
    const segment = createElement("label", "canvas-segment");
    const input = createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = checked;
    const text = createElement("span", "canvas-segment-label");
    text.textContent = label;
    segment.append(input, text);
    segments.append(segment);
  }
  field.append(title, segments);
  return field;
}

// A menu of choices has a selected one. A menu of actions doesn't.
export interface MenuItem {
  label: string;
  // Shown beside the label, e.g. its keyboard shortcut.
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** Choosing an item closes the menu. The selected one has a check mark. */
export function createMenu(
  host: ToolbarHost,
  items: MenuItem[]
): HTMLDivElement {
  const menu = createElement("div", "canvas-menu");
  for (const { label, hint, selected, disabled = false, onSelect } of items) {
    const item = createButton("canvas-menu-item");
    if (selected !== undefined) {
      item.setAttribute("aria-pressed", String(selected));
    }
    item.disabled = disabled;
    item.textContent = label;
    if (hint) {
      const hintElement = createElement("span", "canvas-menu-hint");
      hintElement.textContent = hint;
      // The label names the item, so the shortcut isn't read with it.
      hintElement.setAttribute("aria-hidden", "true");
      item.append(hintElement);
    }
    item.addEventListener("click", () => {
      host.closePopover();
      onSelect();
    });
    menu.append(item);
  }
  return menu;
}

/** Cancel, which closes the popover, and the button that does what it's for. */
export function createFormButtons(
  host: ToolbarHost,
  submit: HTMLButtonElement
): HTMLDivElement {
  const buttons = createElement("div", "canvas-confirmation-buttons");
  const cancel = createButton("canvas-button");
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => host.closePopover());
  buttons.append(cancel, submit);
  return buttons;
}

/** A form's primary button, which submits it. */
export function createSubmitButton(label: string): HTMLButtonElement {
  const submit = createElement("button", "canvas-button canvas-button-primary");
  submit.type = "submit";
  submit.textContent = label;
  return submit;
}
