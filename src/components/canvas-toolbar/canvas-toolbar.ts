import { COLORS } from "../../constants/colors.const";
import { MAX_TOOL_SIZE } from "../../constants/max-tool-size.const";
import { MIN_TOOL_SIZE } from "../../constants/min-tool-size.const";
import { TOOLS } from "../../constants/tools.const";
import { type Color } from "../../models/color.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Tool } from "../../models/tool.model";
import { createElement } from "../../utilities/create-element";
import { showPopover } from "../popover/popover";
import "./canvas-toolbar.css";

type ToolbarPopover = Tool | "color";

const TOOL_LABELS: Record<Tool, string> = {
  eraser: "Eraser",
  pencil: "Pencil",
};

export interface CanvasToolbarState {
  activeTool: Tool;
  tools: Record<Tool, ToolState>;
  canUndo: boolean;
  canRedo: boolean;
}

export interface CanvasToolbarActions {
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: (tool: Tool) => void;
  onUpdateTool: (tool: Tool, values: Partial<ToolState>) => void;
}

// The selection ring needs to stand out against the color it sits on.
function getRingColor(color: Color): string {
  return color === "--canvas-color-white"
    ? "var(--canvas-color-ring-on-light)"
    : "var(--canvas-color-ring)";
}

// e.g. "--canvas-color-red" becomes "red".
function getColorName(color: Color): string {
  return color.replace("--canvas-color-", "");
}

// Buttons default to submitting a form, e.g. if the host mounts the canvas in one.
function createButton(className: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  return button;
}

function createColorRing(color: Color): HTMLSpanElement {
  const ring = createElement("span", "canvas-color-ring");
  ring.style.borderColor = getRingColor(color);
  return ring;
}

// The pencil always has a color. The fallback only satisfies the type.
function getPencilColor(state: CanvasToolbarState): Color {
  return state.tools.pencil.color ?? COLORS[0];
}

export class CanvasToolbar {
  readonly element = createElement("div", "canvas-toolbar");
  #state: CanvasToolbarState;
  #actions: CanvasToolbarActions;
  #undoButton = createButton("canvas-toolbar-button");
  #redoButton = createButton("canvas-toolbar-button");
  #toolButtons: Record<Tool, HTMLButtonElement> = {
    eraser: createButton("canvas-toolbar-button"),
    pencil: createButton("canvas-toolbar-button"),
  };
  #colorButton = createButton(
    "canvas-toolbar-button canvas-toolbar-icon-button"
  );
  #colorRing = createElement("span", "canvas-color-ring");
  #openPopover: ToolbarPopover | null = null;
  #removePopover: (() => void) | null = null;

  constructor(state: CanvasToolbarState, actions: CanvasToolbarActions) {
    this.#state = state;
    this.#actions = actions;

    this.#undoButton.textContent = "Undo";
    this.#undoButton.addEventListener("click", () => actions.onUndo());
    this.#redoButton.textContent = "Redo";
    this.#redoButton.addEventListener("click", () => actions.onRedo());
    this.element.append(this.#undoButton, this.#redoButton);

    for (const tool of TOOLS) {
      const button = this.#toolButtons[tool];
      button.textContent = TOOL_LABELS[tool];
      button.addEventListener("click", () => this.#onToolClick(tool));
      const anchor = createElement("div", "canvas-toolbar-item");
      anchor.append(button);
      this.element.append(anchor);
    }

    this.#colorButton.append(this.#colorRing);
    this.#colorButton.addEventListener("click", () =>
      this.#togglePopover("color")
    );
    const colorAnchor = createElement("div", "canvas-toolbar-item");
    colorAnchor.append(this.#colorButton);
    this.element.append(colorAnchor);

    this.update(state);
  }

  update(state: CanvasToolbarState): void {
    this.#state = state;
    this.#undoButton.disabled = !state.canUndo;
    this.#redoButton.disabled = !state.canRedo;
    for (const tool of TOOLS) {
      const button = this.#toolButtons[tool];
      button.setAttribute("aria-pressed", String(tool === state.activeTool));
      button.setAttribute("aria-expanded", String(this.#openPopover === tool));
    }

    const pencilColor = getPencilColor(state);
    const colorButton = this.#colorButton;
    colorButton.setAttribute(
      "aria-label",
      `Color: ${getColorName(pencilColor)}`
    );
    colorButton.setAttribute(
      "aria-expanded",
      String(this.#openPopover === "color")
    );
    colorButton.style.backgroundColor = `var(${pencilColor})`;
    this.#colorRing.style.borderColor = getRingColor(pencilColor);
  }

  destroy(): void {
    this.#closePopover();
  }

  // Close the open popover on any press outside the toolbar, e.g. on the canvas.
  #onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.element.contains(event.target as Node)) {
      this.#closePopover();
    }
  };

  #closePopover(): void {
    if (!this.#openPopover) {
      return;
    }
    this.#removePopover?.();
    this.#removePopover = null;
    this.#openPopover = null;
    document.removeEventListener("pointerdown", this.#onDocumentPointerDown);
    this.update(this.#state);
  }

  #togglePopover(popover: ToolbarPopover): void {
    const wasOpen = this.#openPopover === popover;
    this.#closePopover();
    if (wasOpen) {
      return;
    }
    this.#openPopover = popover;
    this.update(this.#state);
    const opener =
      popover === "color" ? this.#colorButton : this.#toolButtons[popover];
    const content =
      popover === "color"
        ? this.#createColorOptions()
        : this.#createSizeSlider(popover);
    this.#removePopover = showPopover(opener, content, () =>
      this.#closePopover()
    );
    document.addEventListener("pointerdown", this.#onDocumentPointerDown);
  }

  // Clicking the active tool again opens its size slider.
  #onToolClick(tool: Tool): void {
    if (tool === this.#state.activeTool) {
      this.#togglePopover(tool);
    } else {
      this.#closePopover();
      this.#actions.onSelectTool(tool);
    }
  }

  #onColorClick(color: Color): void {
    this.#closePopover();
    this.#actions.onUpdateTool("pencil", { color });
    this.#actions.onSelectTool("pencil");
  }

  #createSizeSlider(tool: Tool): HTMLInputElement {
    const slider = createElement("input", "canvas-tool-size-slider");
    slider.type = "range";
    slider.setAttribute("aria-label", `${TOOL_LABELS[tool]} size`);
    slider.min = String(MIN_TOOL_SIZE);
    slider.max = String(MAX_TOOL_SIZE);
    slider.value = String(this.#state.tools[tool].size);
    slider.addEventListener("input", () =>
      this.#actions.onUpdateTool(tool, { size: Number(slider.value) })
    );
    return slider;
  }

  #createColorOptions(): HTMLDivElement {
    const pencilColor = getPencilColor(this.#state);
    const grid = createElement("div", "canvas-color-grid");
    for (const color of COLORS) {
      const option = createButton("canvas-color-option");
      option.setAttribute("aria-label", getColorName(color));
      option.setAttribute("aria-pressed", String(color === pencilColor));
      option.style.backgroundColor = `var(${color})`;
      if (color === pencilColor) {
        option.append(createColorRing(color));
      }
      option.addEventListener("click", () => this.#onColorClick(color));
      grid.append(option);
    }
    return grid;
  }
}
