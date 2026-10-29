import { COLORS } from "../../constants/colors.const";
import { EXPORT_FORMATS } from "../../constants/export-formats.const";
import { EXPORT_SCALES } from "../../constants/export-scales.const";
import { FILE_MENU_ITEMS } from "../../constants/file-menu-items.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { TOOLBAR_ACTIONS } from "../../constants/toolbar-actions.const";
import { TOOL_SHORTCUTS } from "../../constants/tool-shortcuts.const";
import { TOOL_SIZES } from "../../constants/tool-sizes.const";
import { TOOLS } from "../../constants/tools.const";
import { UNTITLED_NAME } from "../../constants/untitled-name.const";
import { type CanvasEntry } from "../../models/canvas-entry.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import {
  type ExportFormat,
  type ExportOptions,
  type ExportScale,
} from "../../models/export-options.model";
import { type Size } from "../../models/size.model";
import {
  type FileMenuItem,
  type ToolbarAction,
  type ToolbarControl,
  type ZoomAction,
} from "../../models/toolbar-control.model";
import { type ToolState } from "../../models/tool-state.model";
import { type StrokeTool, type Tool } from "../../models/tool.model";
import { createElement } from "../../utilities/create-element";
import {
  getColorName,
  isCustomColor,
  resolveColor,
} from "../../utilities/colors";
import { canExportAt, getExportSize } from "../../utilities/export-drawing";
import { createColorPicker } from "../color-picker/color-picker";
import { showPopover } from "../popover/popover";
import "./canvas-toolbar.css";

type ControlName = ToolbarControl["action"];

// A button, or an item in the file menu.
type ActionName = ControlName | FileMenuItem;

// Which edge of the canvas the toolbar sits on. Its popovers and tooltips
// open away from the canvas, e.g. below a toolbar at the top.
export type ToolbarPosition = "top" | "bottom";

// Each tool with a size has a slider for it.
type ToolbarPopover =
  | SizedTool
  | "color"
  | "zoom"
  | "file-menu"
  | "history"
  | "rename"
  | "export";

// The names screen readers announce, and tooltips show.
const ACTION_LABELS: Record<ToolbarAction, string> = {
  undo: "Undo",
  redo: "Redo",
  clear: "Clear",
  "new-canvas": "New canvas",
  history: "History",
  export: "Export",
  move: "Move",
  pencil: "Pencil",
  eraser: "Eraser",
  bucket: "Paint bucket",
  note: "Sticky note",
  dropper: "Dropper",
  text: "Text",
  image: "Insert image",
};

// Opening a saved canvas is what a file menu's history is for.
const FILE_MENU_LABELS: Record<FileMenuItem, string> = {
  "new-canvas": ACTION_LABELS["new-canvas"],
  history: "Open",
  rename: "Rename",
  export: ACTION_LABELS.export,
};

const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  svg: "SVG",
};

// The tools with a size, which clicking them again picks.
type SizedTool = Exclude<Tool, "move" | "bucket" | "note" | "dropper">;

const TOOL_LABELS: Record<SizedTool, string> = {
  eraser: ACTION_LABELS.eraser,
  pencil: ACTION_LABELS.pencil,
  text: ACTION_LABELS.text,
};

// Controls that open a popover, which is positioned against them.
const ANCHORED: ControlName[] = [
  "new-canvas",
  "history",
  "export",
  "pencil",
  "eraser",
  "text",
  "color",
  "zoom",
  "file-menu",
];

// A menu of choices has a selected one. A menu of actions doesn't.
interface MenuItem {
  label: string;
  // Shown beside the label, e.g. its keyboard shortcut.
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

// Shortcuts use Cmd on a Mac, and Ctrl elsewhere.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl+";
const SHIFT = IS_MAC ? "⇧" : "Shift+";

// Undo's and redo's, shown after their names.
const HISTORY_SHORTCUTS: Partial<
  Record<ToolbarAction, { shown: string; aria: string }>
> = {
  undo: {
    shown: `${MOD}Z`,
    aria: IS_MAC ? "Meta+Z" : "Control+Z",
  },
  redo: {
    shown: `${MOD}${SHIFT}Z`,
    aria: IS_MAC ? "Meta+Shift+Z" : "Control+Shift+Z Control+Y",
  },
};

const ZOOM_ITEMS: { action: ZoomAction; label: string; hint: string }[] = [
  { action: "in", label: "Zoom in", hint: `${MOD}+` },
  { action: "out", label: "Zoom out", hint: `${MOD}−` },
  { action: "reset", label: "Zoom to 100%", hint: `${MOD}0` },
  { action: "fit", label: "Zoom to fit", hint: `${SHIFT}1` },
];

export interface CanvasToolbarState {
  activeTool: Tool;
  tools: Record<StrokeTool, ToolState>;
  noteColor: ToolColor;
  // Which color the color control picks: the pencil's, which text uses too,
  // or new notes'.
  colorTarget: "pencil" | "note";
  // Custom colors picked, most recent first.
  recentColors: CustomColor[];
  textSize: number;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  canStartNew: boolean;
  // Empty for an untitled canvas.
  name: string;
  // The drawing's size in drawing units, which the export is a multiple of.
  drawingSize: Size;
  // What the export dialog starts with: the options last exported with.
  exportOptions: ExportOptions;
  // Most recently edited first.
  canvases: CanvasEntry[];
  // The history entry that's open, if any.
  openCanvasId: string | null;
  // Screen pixels per drawing unit, e.g. 1 at 100%.
  zoom: number;
  // Whether the rulers along the canvas's edges are shown.
  rulers: boolean;
}

export interface CanvasToolbarActions {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onNewCanvas: () => void;
  onOpenCanvas: (id: string) => void;
  onDeleteCanvas: (id: string) => void;
  onRename: (name: string) => void;
  onExport: (options: ExportOptions) => void;
  onSelectTool: (tool: Tool) => void;
  onUpdateTool: (tool: StrokeTool, values: Partial<ToolState>) => void;
  onUpdateNoteColor: (color: ToolColor) => void;
  onUpdateTextSize: (size: number) => void;
  onInsertImage: () => void;
  onZoom: (action: ZoomAction) => void;
  onToggleRulers: () => void;
}

/**
 * Throws if the toolbar's controls can't work as listed, e.g. a misspelled
 * name. Checked before anything is added to the page.
 */
export function validateToolbar(groups: ToolbarControl[][]): void {
  const names: ActionName[] = [];
  const add = (name: ActionName) => {
    if (names.includes(name)) {
      throw new Error(`The toolbar lists "${name}" more than once.`);
    }
    names.push(name);
  };
  for (const control of groups.flat()) {
    const { action } = control;
    const isButton = TOOLBAR_ACTIONS.includes(action as ToolbarAction);
    if (
      !isButton &&
      action !== "color" &&
      action !== "zoom" &&
      action !== "file-menu" &&
      action !== "custom"
    ) {
      throw new Error(`"${action}" isn't a toolbar control.`);
    }
    if (isButton && !("icon" in control && control.icon instanceof Element)) {
      throw new Error(`The toolbar's "${action}" button needs an icon.`);
    }
    if (action === "custom") {
      const { label, onClick } = control;
      if (typeof label !== "string" || label === "") {
        throw new Error("A custom toolbar control needs a label.");
      }
      if (typeof onClick !== "function") {
        throw new Error(`The toolbar's "${label}" control needs an onClick.`);
      }
      // There can be several, so they aren't checked for repeats.
      continue;
    }
    add(action);
    if (action === "file-menu") {
      const { items } = control;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("The file menu needs at least one item.");
      }
      for (const item of items) {
        if (!FILE_MENU_ITEMS.includes(item)) {
          throw new Error(`"${item}" can't go in the file menu.`);
        }
        add(item);
      }
    }
  }
}

/** Every action the toolbar offers, as a button or in the file menu. */
export function getToolbarActions(groups: ToolbarControl[][]): ActionName[] {
  return groups
    .flat()
    .flatMap((control) =>
      control.action === "file-menu"
        ? [control.action, ...control.items]
        : [control.action]
    );
}

// A CSS color to show a tool's color with.
function toCss(color: ToolColor): string {
  return isCustomColor(color) ? color : `var(${color})`;
}

// Buttons default to submitting a form, e.g. if the host mounts the canvas in one.
function createButton(className: string): HTMLButtonElement {
  const button = createElement("button", className);
  button.type = "button";
  return button;
}

// How long the pointer rests on a button before its tooltip shows.
const TOOLTIP_DELAY = 500;
// For this long after a tooltip hides, the next one shows straight away, so
// moving along the toolbar doesn't wait at every button.
const TOOLTIP_WARM_TIME = 300;
// Gap between a tooltip and its button, and the viewport's edges.
const TOOLTIP_GAP = 6;
const VIEWPORT_MARGIN = 8;

// A copy of the host page's icon, so the same one can be used again.
function createIconButton(action: ToolbarAction, icon: Element) {
  const button = createButton("canvas-toolbar-button");
  const label = ACTION_LABELS[action];
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
  // A tool's key is shown after its name.
  const shortcut = TOOL_SHORTCUTS[action as Tool] as string | undefined;
  if (shortcut) {
    button.dataset.shortcut = shortcut;
    button.setAttribute("aria-keyshortcuts", shortcut);
  }
  const history = HISTORY_SHORTCUTS[action];
  if (history) {
    button.dataset.shortcut = history.shown;
    button.setAttribute("aria-keyshortcuts", history.aria);
  }
  const copy = icon.cloneNode(true) as Element;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("canvas-icon");
  button.append(copy);
  return button;
}

// Actions that would do nothing, so their buttons and menu items are disabled.
function getDisabled(
  state: CanvasToolbarState
): Partial<Record<ActionName, boolean>> {
  return {
    undo: !state.canUndo,
    redo: !state.canRedo,
    clear: !state.canClear,
    "new-canvas": !state.canStartNew,
  };
}

interface SegmentOption {
  value: string;
  label: string;
  checked: boolean;
}

// Radio buttons, named `name`, that look like a row of joined buttons.
function createSegmented(
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

// What the color control shows and changes. The pencil always has a color.
// The fallback only satisfies the type.
function getColor(state: CanvasToolbarState): ToolColor {
  if (state.colorTarget === "note") {
    return state.noteColor;
  }
  return state.tools.pencil.color ?? COLORS[0];
}

/** The controls the host page asked for, in the groups it listed them in. */
export class CanvasToolbar {
  readonly element = createElement("div", "canvas-toolbar");
  #state: CanvasToolbarState;
  #actions: CanvasToolbarActions;
  #buttons: Partial<Record<ControlName, HTMLButtonElement>> = {};
  #colorSwatch = createElement("span", "canvas-color-swatch");
  #fileMenuItems: FileMenuItem[] = [];
  #openPopover: ToolbarPopover | null = null;
  #removePopover: (() => void) | null = null;
  // Shows a button's name, like a `title`, but sooner and in the toolbar's
  // style. Screen readers already have the name, so it's hidden from them.
  #tooltip = createElement("div", "canvas-tooltip");
  #tooltipButton: HTMLElement | null = null;
  #tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  // Never, at first. Zero would be when the page loaded, so a quick first
  // hover would skip the delay.
  #tooltipHiddenAt = -Infinity;
  // The button last pressed, whose tooltip stays away until the pointer
  // leaves it.
  #pressedButton: HTMLElement | null = null;

  constructor(
    groups: ToolbarControl[][],
    state: CanvasToolbarState,
    actions: CanvasToolbarActions,
    position: ToolbarPosition = "bottom"
  ) {
    this.#state = state;
    this.#actions = actions;
    this.element.dataset.position = position;

    for (const controls of groups) {
      if (controls.length === 0) {
        continue;
      }
      const group = createElement("div", "canvas-toolbar-group");
      for (const control of controls) {
        const button = this.#createControl(control);
        // The host page handles its own, so the toolbar doesn't keep them.
        if (control.action !== "custom") {
          this.#buttons[control.action] = button;
        }
        if (ANCHORED.includes(control.action)) {
          const anchor = createElement("div", "canvas-toolbar-item");
          anchor.append(button);
          group.append(anchor);
        } else {
          group.append(button);
        }
      }
      this.element.append(group);
    }

    this.#tooltip.hidden = true;
    this.#tooltip.setAttribute("aria-hidden", "true");
    this.element.append(this.#tooltip);
    this.element.addEventListener("pointerover", this.#onPointerOver);
    this.element.addEventListener("pointerout", this.#onPointerOut);
    this.element.addEventListener("focusin", this.#onFocusIn);
    this.element.addEventListener("focusout", () => this.#hideTooltip());
    // Like Linear, a press dismisses it until the pointer moves to another
    // button.
    this.element.addEventListener("pointerdown", (event) => {
      this.#pressedButton = (event.target as Element).closest<HTMLElement>(
        "[data-tooltip]"
      );
      this.#hideTooltip();
    });

    this.update(state);
  }

  update(state: CanvasToolbarState): void {
    this.#state = state;
    const buttons = this.#buttons;
    const expanded = (button: HTMLButtonElement | undefined, is: boolean) =>
      button?.setAttribute("aria-expanded", String(is));

    for (const [name, isDisabled] of Object.entries(getDisabled(state))) {
      const button = buttons[name as ControlName];
      if (button) {
        button.disabled = isDisabled;
      }
    }
    expanded(buttons.history, this.#openPopover === "history");
    // Its menu, or what an item in it opened, e.g. the history.
    expanded(
      buttons["file-menu"],
      this.#openPopover !== null &&
        this.#getOpener(this.#openPopover) === buttons["file-menu"]
    );
    for (const tool of TOOLS) {
      buttons[tool]?.setAttribute(
        "aria-pressed",
        String(tool === state.activeTool)
      );
      expanded(buttons[tool], this.#openPopover === tool);
    }

    const colorButton = buttons.color;
    if (colorButton) {
      const color = getColor(state);
      const label = `Color: ${getColorName(color)}`;
      colorButton.setAttribute("aria-label", label);
      colorButton.dataset.tooltip = label;
      expanded(colorButton, this.#openPopover === "color");
      this.#colorSwatch.style.backgroundColor = toCss(color);
    }

    const zoomButton = buttons.zoom;
    if (zoomButton) {
      const zoom = `${Math.round(state.zoom * 100)}%`;
      zoomButton.textContent = zoom;
      zoomButton.setAttribute("aria-label", `Zoom: ${zoom}`);
      expanded(zoomButton, this.#openPopover === "zoom");
    }
  }

  /** Closes its popover and tooltip, e.g. as the toolbar is hidden. */
  close(): void {
    this.#closePopover();
    this.#hideTooltip();
  }

  destroy(): void {
    this.close();
  }

  // Only a mouse or pen hovers. A touch would show it under the finger.
  #onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-tooltip]"
    );
    if (
      button &&
      button !== this.#tooltipButton &&
      button !== this.#pressedButton
    ) {
      this.#scheduleTooltip(button);
    }
  };

  #onPointerOut = (event: PointerEvent): void => {
    const to = event.relatedTarget as Node | null;
    if (this.#pressedButton && !this.#pressedButton.contains(to)) {
      this.#pressedButton = null;
    }
    const button = this.#tooltipButton;
    if (button && !button.contains(to)) {
      this.#hideTooltip();
    }
  };

  // Keyboard focus shows it too, but not focus from a click.
  #onFocusIn = (event: FocusEvent): void => {
    const button = event.target as HTMLElement;
    if (button.dataset.tooltip && button.matches(":focus-visible")) {
      this.#scheduleTooltip(button);
    }
  };

  #scheduleTooltip(button: HTMLElement): void {
    const warm =
      !this.#tooltip.hidden ||
      performance.now() - this.#tooltipHiddenAt < TOOLTIP_WARM_TIME;
    this.#hideTooltip();
    this.#tooltipButton = button;
    if (warm) {
      this.#showTooltip(button, false);
    } else {
      this.#tooltipTimer = setTimeout(
        () => this.#showTooltip(button, true),
        TOOLTIP_DELAY
      );
    }
  }

  // On the side of the button away from the canvas, kept inside the viewport
  // like a popover.
  #showTooltip(button: HTMLElement, animate: boolean): void {
    // Its popover is open, which says more than the name.
    if (button.getAttribute("aria-expanded") === "true") {
      return;
    }
    const tooltip = this.#tooltip;
    tooltip.textContent = button.dataset.tooltip ?? "";
    const { shortcut } = button.dataset;
    if (shortcut) {
      const hint = createElement("span", "canvas-tooltip-hint");
      hint.textContent = shortcut;
      tooltip.append(" ", hint);
    }
    tooltip.toggleAttribute("data-animate", animate);
    tooltip.hidden = false;

    const toolbar = this.element.getBoundingClientRect();
    // Positioned against the inside of the toolbar's border.
    const originLeft = toolbar.left + this.element.clientLeft;
    const originTop = toolbar.top + this.element.clientTop;
    const target = button.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const viewportRight =
      document.documentElement.clientWidth - VIEWPORT_MARGIN - width;
    const left = Math.min(
      Math.max(target.left + (target.width - width) / 2, VIEWPORT_MARGIN),
      viewportRight
    );
    tooltip.style.left = `${left - originLeft}px`;
    const top =
      this.element.dataset.position === "top"
        ? target.bottom + TOOLTIP_GAP
        : target.top - TOOLTIP_GAP - tooltip.offsetHeight;
    tooltip.style.top = `${top - originTop}px`;
  }

  #hideTooltip(): void {
    clearTimeout(this.#tooltipTimer);
    this.#tooltipButton = null;
    if (!this.#tooltip.hidden) {
      this.#tooltip.hidden = true;
      this.#tooltipHiddenAt = performance.now();
    }
  }

  #createControl(control: ToolbarControl): HTMLButtonElement {
    const actions = this.#actions;
    if (control.action === "custom") {
      const button = createButton(
        "canvas-toolbar-button canvas-toolbar-text-button"
      );
      button.textContent = control.label;
      button.addEventListener("click", () => {
        this.#closePopover();
        control.onClick();
      });
      return button;
    }
    if (control.action === "color") {
      const button = createButton("canvas-toolbar-button");
      button.append(this.#colorSwatch);
      // Pressing it leaves focus in text being typed, which it colors.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) =>
        // A click from the keyboard has no `detail`, and moves focus in.
        this.#togglePopover("color", event.detail === 0)
      );
      return button;
    }
    if (control.action === "zoom") {
      const button = createButton(
        "canvas-toolbar-button canvas-toolbar-text-button"
      );
      button.dataset.tooltip = "Zoom";
      button.addEventListener("click", () => this.#togglePopover("zoom"));
      return button;
    }
    if (control.action === "file-menu") {
      this.#fileMenuItems = control.items;
      const button = createButton(
        "canvas-toolbar-button canvas-toolbar-text-button"
      );
      button.textContent = "File";
      button.addEventListener("click", () => this.#togglePopover("file-menu"));
      return button;
    }

    const { action, icon } = control;
    const button = createIconButton(action, icon);
    const fileActions = this.#getFileActions();
    const onClick: Record<ToolbarAction, () => void> = {
      undo: () => actions.onUndo(),
      redo: () => actions.onRedo(),
      clear: () => actions.onClear(),
      ...fileActions,
      move: () => this.#onToolClick("move"),
      pencil: () => this.#onToolClick("pencil"),
      eraser: () => this.#onToolClick("eraser"),
      bucket: () => this.#onToolClick("bucket"),
      note: () => this.#onToolClick("note"),
      text: () => this.#onToolClick("text"),
      dropper: () => this.#onToolClick("dropper"),
      image: () => {
        this.#closePopover();
        actions.onInsertImage();
      },
    };
    button.addEventListener("click", onClick[action]);
    return button;
  }

  // What each file action does, as a button or in the file menu.
  #getFileActions(): Record<FileMenuItem, () => void> {
    const actions = this.#actions;
    return {
      "new-canvas": () => {
        this.#closePopover();
        actions.onNewCanvas();
      },
      history: () => this.#togglePopover("history"),
      rename: () => this.#togglePopover("rename"),
      export: () => this.#togglePopover("export"),
    };
  }

  // Close the open popover on any press outside the toolbar, e.g. on the canvas.
  // It listens before the press reaches the canvas, which keeps some to
  // itself, e.g. to pan.
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
    document.removeEventListener(
      "pointerdown",
      this.#onDocumentPointerDown,
      true
    );
    this.update(this.#state);
  }

  // `takesFocus` is false to leave focus where it is, e.g. in text being
  // typed, when it's opened with the pointer.
  #togglePopover(popover: ToolbarPopover, takesFocus = true): void {
    const wasOpen = this.#openPopover === popover;
    this.#closePopover();
    if (wasOpen) {
      return;
    }
    this.#openPopover = popover;
    this.#hideTooltip();
    this.update(this.#state);
    const [opener, content] = this.#getPopover(popover);
    this.#removePopover = showPopover(
      opener,
      content,
      () => this.#closePopover(),
      takesFocus
    );
    document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
  }

  // The button `popover` appears beside. Only buttons on the toolbar open
  // popovers, so it exists. The history may be in the file menu, so it
  // appears beside that.
  #getOpener(popover: ToolbarPopover): HTMLButtonElement {
    const buttons = this.#buttons;
    switch (popover) {
      case "history":
        return buttons.history ?? buttons["file-menu"]!;
      // Renaming is only in the file menu.
      case "rename":
        return buttons["file-menu"]!;
      case "export":
        return buttons.export ?? buttons["file-menu"]!;
      default:
        return buttons[popover]!;
    }
  }

  // The button that opens `popover`, and what it shows.
  #getPopover(popover: ToolbarPopover): [HTMLButtonElement, Node] {
    const opener = this.#getOpener(popover);
    switch (popover) {
      case "color":
        return [opener, this.#createColorOptions()];
      case "zoom":
        return [
          opener,
          this.#createMenu([
            ...ZOOM_ITEMS.map(({ action, label, hint }) => ({
              label,
              hint,
              onSelect: () => this.#actions.onZoom(action),
            })),
            // Named for what it does, rather than checked, so its shortcut
            // lines up with the others'.
            {
              label: this.#state.rulers ? "Hide rulers" : "Show rulers",
              hint: `${SHIFT}R`,
              onSelect: () => this.#actions.onToggleRulers(),
            },
          ]),
        ];
      case "file-menu": {
        const fileActions = this.#getFileActions();
        const disabled = getDisabled(this.#state);
        return [
          opener,
          this.#createMenu(
            this.#fileMenuItems.map((item) => ({
              label: FILE_MENU_LABELS[item],
              disabled: disabled[item],
              onSelect: fileActions[item],
            }))
          ),
        ];
      }
      case "history":
        return [opener, this.#createHistoryList()];
      case "rename":
        return [opener, this.#createRenameForm()];
      case "export":
        return [opener, this.#createExportForm()];
      default:
        return [
          opener,
          popover === "text"
            ? this.#createTextSizeSlider()
            : this.#createSizePicker(popover),
        ];
    }
  }

  // Clicking the active tool again opens its size slider. The move tool, the
  // bucket and notes have no size, and the dropper goes back to the tool before it.
  #onToolClick(tool: Tool): void {
    if (tool === this.#state.activeTool) {
      if (tool === "dropper") {
        this.#actions.onSelectTool(tool);
      } else if (tool !== "note" && tool !== "move" && tool !== "bucket") {
        this.#togglePopover(tool);
      }
    } else {
      this.#closePopover();
      this.#actions.onSelectTool(tool);
    }
  }

  // Picking a color while erasing goes back to the pencil.
  #onColorClick(color: ToolColor): void {
    this.#closePopover();
    if (this.#state.colorTarget === "note") {
      this.#actions.onUpdateNoteColor(color);
      return;
    }
    this.#actions.onUpdateTool("pencil", { color });
    if (this.#state.activeTool === "eraser") {
      this.#actions.onSelectTool("pencil");
    }
  }

  // Text's font size, from its smallest to its largest.
  #createTextSizeSlider(): HTMLInputElement {
    const slider = createElement("input", "canvas-tool-size-slider");
    slider.type = "range";
    slider.setAttribute("aria-label", `${TOOL_LABELS.text} size`);
    slider.min = String(TEXT_LAYOUT.minSize);
    slider.max = String(TEXT_LAYOUT.maxSize);
    slider.value = String(this.#state.textSize);
    slider.addEventListener("input", () =>
      this.#actions.onUpdateTextSize(Number(slider.value))
    );
    return slider;
  }

  // The pencil's and eraser's sizes, each shown as the dot it draws, at the
  // size it draws it, in the pencil's color or as the eraser's outline.
  // Picking one closes it, like picking a color.
  #createSizePicker(tool: StrokeTool): HTMLDivElement {
    const picker = createElement("div", "canvas-size-picker");
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", `${TOOL_LABELS[tool]} size`);
    const { size: current, color } = this.#state.tools[tool];
    const shown = color === undefined ? null : toCss(color);
    for (const size of TOOL_SIZES[tool]) {
      const option = createButton("canvas-size-option");
      const width = size * 2;
      option.setAttribute("aria-label", `${width} pixels`);
      option.setAttribute("aria-pressed", String(size === current));
      const dot = createElement("span", "canvas-size-dot");
      dot.style.setProperty("--canvas-size", `${width}px`);
      if (shown) {
        dot.style.backgroundColor = shown;
      } else {
        dot.toggleAttribute("data-erases", true);
      }
      const label = createElement("span", "canvas-size-label");
      label.textContent = String(width);
      label.setAttribute("aria-hidden", "true");
      option.append(dot, label);
      option.addEventListener("click", () => {
        this.#closePopover();
        this.#actions.onUpdateTool(tool, { size });
      });
      picker.append(option);
    }
    return picker;
  }

  #createColorOptions(): HTMLDivElement {
    const picker = createColorPicker({
      swatches: COLORS.map((color) => ({
        label: getColorName(color),
        value: color,
        shown: toCss(color),
      })),
      selected: getColor(this.#state),
      current: resolveColor(this.element, getColor(this.#state)),
      recent: this.#state.recentColors,
      onPick: (value) => this.#onColorClick(value as ToolColor),
    });
    // Typing a color code here doesn't stop typing text, which it colors.
    picker.dataset.canvasKeepsTyping = "";
    return picker;
  }

  // Choosing an item closes the menu. The selected one has a check mark.
  #createMenu(items: MenuItem[]): HTMLDivElement {
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
        this.#closePopover();
        onSelect();
      });
      menu.append(item);
    }
    return menu;
  }

  // The name field is first, so it's what the popover focuses, with the name
  // selected to type over. Enter saves, and Escape or Cancel leaves it as it was.
  #createRenameForm(): HTMLFormElement {
    const form = createElement("form", "canvas-form canvas-rename");
    const title = createElement("p", "canvas-confirmation-message");
    title.textContent = "Rename canvas";
    const input = createElement("input", "canvas-text-input");
    input.type = "text";
    input.value = this.#state.name;
    input.placeholder = UNTITLED_NAME;
    input.setAttribute("aria-label", "Canvas name");
    input.addEventListener("focus", () => input.select(), { once: true });
    const buttons = createElement("div", "canvas-confirmation-buttons");
    const cancel = createButton("canvas-button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.#closePopover());
    const save = createElement("button", "canvas-button canvas-button-primary");
    save.type = "submit";
    save.textContent = "Save";
    form.addEventListener("submit", (event) => {
      // It would otherwise submit a form the host mounted the canvas in.
      event.preventDefault();
      this.#closePopover();
      this.#actions.onRename(input.value.trim());
    });
    buttons.append(cancel, save);
    form.append(title, input, buttons);
    return form;
  }

  // The chosen format is what the popover focuses. Enter exports, and Escape
  // or Cancel closes it without exporting.
  #createExportForm(): HTMLFormElement {
    const { drawingSize, exportOptions } = this.#state;
    const form = createElement("form", "canvas-form canvas-export");
    const title = createElement("p", "canvas-confirmation-message");
    title.textContent = "Export";

    const formats = createSegmented(
      "Format",
      "format",
      EXPORT_FORMATS.map((format) => ({
        value: format,
        label: EXPORT_FORMAT_LABELS[format],
        checked: format === exportOptions.format,
      }))
    );
    const scales = createSegmented(
      "Size",
      "scale",
      EXPORT_SCALES.map((scale) => ({
        value: String(scale),
        label: `${scale}×`,
        checked: scale === exportOptions.scale,
      }))
    );
    const pixels = createElement("p", "canvas-export-size");
    scales.append(pixels);

    const transparent = createElement("label", "canvas-checkbox");
    const transparentInput = createElement("input");
    transparentInput.type = "checkbox";
    transparentInput.name = "transparent";
    transparentInput.checked = exportOptions.transparent;
    transparent.append(transparentInput, "Transparent background");

    const read = (): ExportOptions => {
      const data = new FormData(form);
      return {
        format: data.get("format") as ExportFormat,
        scale: Number(data.get("scale")) as ExportScale,
        transparent: transparentInput.checked,
      };
    };
    // Shows the size in pixels, and turns off what the format can't do: JPEG
    // has no transparency, and a PNG or JPEG can be too big to make.
    const refresh = () => {
      const { format } = read();
      const isImage = format !== "svg";
      transparentInput.disabled = format === "jpeg";
      transparent.toggleAttribute("data-disabled", format === "jpeg");
      const radios = [
        ...scales.querySelectorAll<HTMLInputElement>('input[name="scale"]'),
      ];
      for (const radio of radios) {
        radio.disabled =
          isImage &&
          !canExportAt(drawingSize, Number(radio.value) as ExportScale);
      }
      // The largest that fits, if the chosen one doesn't.
      if (radios.find((radio) => radio.checked)?.disabled) {
        const fits = radios.filter((radio) => !radio.disabled);
        (fits.at(-1) ?? radios[0]).checked = true;
      }
      const { width, height } = getExportSize(drawingSize, read().scale);
      pixels.textContent = `${width} × ${height} px`;
    };
    form.addEventListener("change", refresh);

    const buttons = createElement("div", "canvas-confirmation-buttons");
    const cancel = createButton("canvas-button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.#closePopover());
    const submit = createElement(
      "button",
      "canvas-button canvas-button-primary"
    );
    submit.type = "submit";
    submit.textContent = "Export";
    form.addEventListener("submit", (event) => {
      // It would otherwise submit a form the host mounted the canvas in.
      event.preventDefault();
      const options = read();
      this.#closePopover();
      this.#actions.onExport(options);
    });
    buttons.append(cancel, submit);
    form.append(title, formats, scales, transparent, buttons);
    refresh();
    return form;
  }

  #createHistoryList(): HTMLElement {
    if (this.#state.canvases.length === 0) {
      const empty = createElement("p", "canvas-history-empty");
      empty.textContent = "Canvases you draw on show up here.";
      return empty;
    }
    const list = createElement("ul", "canvas-history");
    for (const entry of this.#state.canvases) {
      list.append(this.#createHistoryItem(entry));
    }
    return list;
  }

  #createHistoryItem({ id, name, updatedAt }: CanvasEntry): HTMLLIElement {
    const label = name || UNTITLED_NAME;
    const isOpen = id === this.#state.openCanvasId;
    const item = createElement("li", "canvas-history-item");

    // Opening the open canvas again would do nothing, so it isn't a button.
    const open = isOpen
      ? createElement("div", "canvas-history-open")
      : createButton("canvas-history-open");
    if (!isOpen) {
      open.setAttribute("aria-label", `Open ${label}`);
      open.addEventListener("click", () => {
        this.#closePopover();
        this.#actions.onOpenCanvas(id);
      });
    }
    const nameElement = createElement("span", "canvas-history-name");
    nameElement.textContent = label;
    const date = createElement("span", "canvas-history-date");
    date.textContent = isOpen
      ? "Open now"
      : new Date(updatedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
    open.append(nameElement, date);

    // Deleting can't be undone, so the first click asks for a second.
    const remove = createButton("canvas-history-delete");
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${label}`);
    remove.addEventListener("click", () => {
      if (remove.dataset.confirming === undefined) {
        remove.dataset.confirming = "";
        remove.textContent = "Confirm";
        remove.setAttribute("aria-label", `Confirm deleting ${label}`);
        return;
      }
      this.#actions.onDeleteCanvas(id);
      // Show the shorter list.
      this.#closePopover();
      this.#togglePopover("history");
    });
    item.append(open, remove);
    return item;
  }
}
