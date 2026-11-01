import { createElement } from "../../utilities/create-element";
import "./dropdown.css";

export interface DropdownOption<T> {
  value: T;
  label: string;
  // How the option shows in the menu, e.g. in its own font or size.
  style?: Partial<Record<"fontFamily" | "fontSize", string>>;
}

export interface DropdownOptions<T> {
  // What screen readers call it.
  label: string;
  options: DropdownOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  // What the button shows for a value that isn't an option, e.g. a size
  // typed in. Empty for none, e.g. a selection with more than one.
  describe?: (value: T | null) => string;
  // More in the menu, below the options, e.g. a field to type a size. It's
  // given a function that closes the menu.
  footer?: (close: () => void) => HTMLElement;
  // Pressing it leaves focus where it is, e.g. in text being typed, which
  // its choice formats.
  keepsFocus?: boolean;
}

// Gap between the menu and its button, and the window's edges.
const GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * A button showing what's chosen, with a menu of the choices, the chosen one
 * checked, like Linear's, in place of the browser's own `select`. The arrow
 * keys move through the menu, Enter chooses, and Escape closes it.
 */
export class Dropdown<T> {
  readonly element = createElement("div", "canvas-dropdown");
  #button = createElement("button", "canvas-dropdown-button");
  #text = createElement("span", "canvas-dropdown-text");
  #menu: HTMLElement | null = null;
  #settings: DropdownOptions<T>;

  constructor(settings: DropdownOptions<T>) {
    this.#settings = settings;
    const button = this.#button;
    button.type = "button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    const chevron = createElement("span", "canvas-dropdown-chevron");
    chevron.setAttribute("aria-hidden", "true");
    button.append(this.#text, chevron);
    if (settings.keepsFocus) {
      button.addEventListener("mousedown", (event) => event.preventDefault());
    }
    button.addEventListener("click", (event) =>
      // A click from the keyboard has no `detail`, and moves focus in.
      this.#menu ? this.close() : this.open(event.detail === 0)
    );
    button.addEventListener("keydown", (event) => {
      if (
        !this.#menu &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        this.open(true);
      }
    });
    this.element.append(button);
    this.#show();
  }

  /** Shows `value` as chosen, and the choices in `options` if given. */
  update(value: T | null, options?: DropdownOption<T>[]): void {
    this.#settings = {
      ...this.#settings,
      value,
      ...(options && { options }),
    };
    this.#show();
  }

  get isOpen(): boolean {
    return this.#menu !== null;
  }

  open(takesFocus = true): void {
    if (this.#menu) {
      return;
    }
    const { options, value, onSelect, footer, keepsFocus } = this.#settings;
    const menu = createElement("div", "canvas-dropdown-menu");
    const list = createElement("div", "canvas-dropdown-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", this.#settings.label);
    for (const option of options) {
      const item = createElement("button", "canvas-dropdown-option");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === value));
      item.textContent = option.label;
      Object.assign(item.style, option.style);
      if (keepsFocus) {
        item.addEventListener("mousedown", (event) => event.preventDefault());
      }
      item.addEventListener("click", () => {
        this.close();
        onSelect(option.value);
      });
      list.append(item);
    }
    menu.append(list);
    if (footer) {
      menu.append(footer(() => this.close()));
    }
    menu.addEventListener("keydown", this.#onMenuKeyDown);
    this.element.append(menu);
    this.#menu = menu;
    this.#button.setAttribute("aria-expanded", "true");
    this.#place(menu);
    document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
    if (takesFocus) {
      (
        list.querySelector<HTMLElement>('[aria-selected="true"]') ??
        list.querySelector<HTMLElement>("button")
      )?.focus();
    }
  }

  close(): void {
    const menu = this.#menu;
    if (!menu) {
      return;
    }
    this.#menu = null;
    // Focus goes back to the button before the menu goes, so it never
    // leaves for nowhere, which would close what the dropdown's in, e.g.
    // stop typing.
    if (menu.contains(document.activeElement) && !this.#settings.keepsFocus) {
      this.#button.focus();
    }
    menu.remove();
    this.#button.setAttribute("aria-expanded", "false");
    document.removeEventListener(
      "pointerdown",
      this.#onDocumentPointerDown,
      true
    );
  }

  #show(): void {
    const { options, value, describe, label } = this.#settings;
    const chosen = options.find((option) => option.value === value);
    const shown = chosen?.label ?? describe?.(value) ?? "";
    this.#text.textContent = shown;
    this.#button.setAttribute(
      "aria-label",
      shown ? `${label}: ${shown}` : label
    );
    this.#button.title = label;
  }

  // Below the button, or above it if there's no room below, and inside the
  // window sideways.
  #place(menu: HTMLElement): void {
    const button = this.#button.getBoundingClientRect();
    const height = menu.offsetHeight;
    const roomBelow = window.innerHeight - button.bottom - VIEWPORT_MARGIN;
    const above = height + GAP > roomBelow && button.top > roomBelow;
    menu.toggleAttribute("data-above", above);
    const { left, right } = menu.getBoundingClientRect();
    const viewportRight =
      document.documentElement.clientWidth - VIEWPORT_MARGIN;
    const shift =
      left < VIEWPORT_MARGIN
        ? VIEWPORT_MARGIN - left
        : right > viewportRight
          ? viewportRight - right
          : 0;
    menu.style.setProperty("--dropdown-shift", `${shift}px`);
  }

  #onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.element.contains(event.target as Node)) {
      this.close();
    }
  };

  #onMenuKeyDown = (event: KeyboardEvent): void => {
    const menu = this.#menu;
    if (!menu) {
      return;
    }
    if (event.key === "Escape") {
      // Only the menu closes, not what it's in, e.g. a popover.
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = [
      ...menu.querySelectorAll<HTMLElement>(".canvas-dropdown-option"),
    ];
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next =
      index === -1
        ? step === 1
          ? 0
          : items.length - 1
        : (index + step + items.length) % items.length;
    items[next].focus();
  };
}
