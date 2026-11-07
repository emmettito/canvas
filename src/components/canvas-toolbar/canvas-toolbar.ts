import { type CanvasEntry } from "../../models/canvas-entry.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import {
  type ExportOptions,
  type ExportSource,
} from "../../models/export-options.model";
import { type Size } from "../../models/size.model";
import { type TimerSound } from "../../models/timer.model";
import {
  type MountedControl,
  type ToolbarControl,
  type ToolbarHost,
  type ToolbarPopover,
  type ToolbarTool,
  type ToolOptions,
  type ZoomAction,
} from "../../models/toolbar-control.model";
import { type ToolState } from "../../models/tool-state.model";
import { type StrokeTool, type Tool } from "../../models/tool.model";
import {
  type ColorFormat,
  type ColorFormats,
} from "../../utilities/color-formats";
import { createElement } from "../../utilities/create-element";
import { showDialog } from "../dialog/dialog";
import { showPopover } from "../popover/popover";
import "./canvas-toolbar.css";

/** Whose color the color control picks. */
export type ColorTarget = "pencil" | "highlighter" | "bucket" | "note";

// Which edge of the canvas the toolbar sits on. Its popovers and tooltips
// open away from the canvas, e.g. below a toolbar at the top.
export type ToolbarPosition = "top" | "bottom";

export interface CanvasToolbarState {
  activeTool: Tool;
  // The tool the dropper goes back to, whose color it picks, while it's
  // picked.
  previousTool: Tool;
  tools: Record<StrokeTool, ToolState>;
  bucketColor: ToolColor;
  noteColor: ToolColor;
  // The color of the note being typed in, which the note's options show and
  // change, or null if none is.
  typingNoteColor: string | null;
  // How each tool's custom color is written, e.g. as hex.
  colorFormats: ColorFormats;
  // Which color the color control picks: the pencil's, which text uses too,
  // the highlighter's, the bucket's, or new notes'.
  colorTarget: ColorTarget;
  // Custom colors picked, most recent first.
  recentColors: CustomColor[];
  textSize: number;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  canStartNew: boolean;
  // Empty for an untitled canvas.
  name: string;
  // Whoever's drawing's whole name, which exports keep as their author, or
  // empty.
  author: string;
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
  // The timer, while it's going: how long's left, in milliseconds, and who
  // started it, or null if it was whoever's here.
  timer: { remaining: number; by: string | null } | null;
  // What a new timer starts with: the last one's length, in milliseconds,
  // and sound.
  timerDuration: number;
  timerSound: TimerSound;
}

export interface CanvasToolbarActions {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onNewCanvas: () => void;
  onOpenCanvas: (id: string) => void;
  onDeleteCanvas: (id: string) => void;
  onRename: (name: string) => void;
  /** What a file of the drawing is made from. */
  getExportSource: () => Promise<ExportSource>;
  /** Keeps the options exported with, which the next export starts from. */
  onExportOptions: (options: ExportOptions) => void;
  onSelectTool: (tool: Tool) => void;
  onUpdateTool: (tool: StrokeTool, values: Partial<ToolState>) => void;
  onUpdateNoteColor: (color: ToolColor) => void;
  onUpdateBucketColor: (color: ToolColor) => void;
  onUpdateColorFormat: (target: ColorTarget, format: ColorFormat) => void;
  onInsertImage: () => void;
  onZoom: (action: ZoomAction) => void;
  onToggleRulers: () => void;
  onStartTimer: (duration: number, sound: TimerSound) => void;
  onStopTimer: () => void;
}

/**
 * Throws if the toolbars' controls can't work as listed, e.g. one that isn't
 * a control, or one listed twice. Checked before anything is added to the
 * page.
 */
export function validateToolbar(groups: ToolbarControl[][]): void {
  const names: string[] = [];
  for (const control of groups.flat()) {
    if (
      typeof (control as Partial<ToolbarControl> | null)?.mount !== "function"
    ) {
      throw new Error(
        "The toolbar lists something that isn't a control. Make each with a control function, e.g. undoButton(icon)."
      );
    }
    // There can be several custom buttons, so they aren't checked for
    // repeats.
    for (const name of getNames(control)) {
      if (names.includes(name)) {
        throw new Error(`The toolbar lists "${name}" more than once.`);
      }
      names.push(name);
    }
  }
}

// A control's name, and its menu's items'.
function getNames(control: ToolbarControl): string[] {
  return [
    ...(control.name === null ? [] : [control.name]),
    ...(control.items ?? []).map((item) => item.name),
  ];
}

/** Every action the toolbars offer, as a button or in the file menu. */
export function getToolbarNames(groups: ToolbarControl[][]): string[] {
  return groups.flat().flatMap(getNames);
}

/** The tools the toolbars have buttons for. */
export function getToolbarTools(groups: ToolbarControl[][]): ToolbarTool[] {
  return groups.flat().flatMap((control) => control.tool ?? []);
}

// How long the pointer rests on a button before its tooltip shows.
const TOOLTIP_DELAY = 500;
// For this long after a tooltip hides, the next one shows straight away, so
// moving along the toolbar doesn't wait at every button.
const TOOLTIP_WARM_TIME = 300;
// Gap between a tooltip and its button, and the viewport's edges.
const TOOLTIP_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * The controls the host page asked for, in the groups it listed them in.
 * Each control makes its own element, and its own popovers, so the toolbar
 * only knows what they have in common: tooltips, popovers, and the bar of
 * the picked tool's options.
 */
export class CanvasToolbar {
  readonly element = createElement("div", "canvas-toolbar");
  /**
   * The picked tool's options, in a smaller bar of their own, above a
   * toolbar at the bottom or below one at the top, while a tool with options
   * that's on this toolbar is picked. Hidden otherwise.
   */
  readonly options = createElement("div", "canvas-toolbar canvas-tool-options");
  #mounted: MountedControl[] = [];
  // The tools with a button on this toolbar.
  #tools = new Map<Tool, ToolbarTool>();
  #optionsTool: Tool | null = null;
  #toolOptions: ToolOptions | null = null;
  // Whether the options were made before the bar was on the page, when the
  // palette's CSS colors can't be read, e.g. for notes' shades.
  #optionsDetached = false;
  #state: CanvasToolbarState;
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
  // What each control is given.
  #host: ToolbarHost;

  constructor(
    groups: ToolbarControl[][],
    state: CanvasToolbarState,
    actions: CanvasToolbarActions,
    position: ToolbarPosition = "bottom"
  ) {
    this.#state = state;
    this.element.dataset.position = position;
    this.options.dataset.position = position;
    this.options.setAttribute("role", "toolbar");
    this.options.hidden = true;
    const getState = () => this.#state;
    const getOpenPopover = () => this.#openPopover;
    this.#host = {
      element: this.element,
      get state() {
        return getState();
      },
      actions,
      get openPopover() {
        return getOpenPopover();
      },
      togglePopover: (popover, takesFocus) =>
        this.#togglePopover(popover, takesFocus),
      closePopover: () => this.#closePopover(),
    };

    for (const controls of groups) {
      if (controls.length === 0) {
        continue;
      }
      const group = createElement("div", "canvas-toolbar-group");
      for (const control of controls) {
        const mounted = control.mount(this.#host);
        this.#mounted.push(mounted);
        if (control.tool) {
          this.#tools.set(control.tool.tool, control.tool);
        }
        if (mounted.anchored) {
          const anchor = createElement("div", "canvas-toolbar-item");
          anchor.append(mounted.element);
          group.append(anchor);
        } else {
          group.append(mounted.element);
        }
      }
      this.element.append(group);
    }

    this.#tooltip.hidden = true;
    this.#tooltip.setAttribute("aria-hidden", "true");
    this.element.append(this.#tooltip);
    for (const bar of [this.element, this.options]) {
      bar.addEventListener("pointerover", this.#onPointerOver);
      bar.addEventListener("pointerout", this.#onPointerOut);
      bar.addEventListener("focusin", this.#onFocusIn);
      bar.addEventListener("focusout", () => this.#hideTooltip());
      // Like Linear, a press dismisses it until the pointer moves to another
      // button.
      bar.addEventListener("pointerdown", (event) => {
        this.#pressedButton = (event.target as Element).closest<HTMLElement>(
          "[data-tooltip]"
        );
        this.#hideTooltip();
      });
    }

    this.update(state);
  }

  update(state: CanvasToolbarState): void {
    this.#state = state;
    const opener = this.#openPopover?.opener ?? null;
    for (const mounted of this.#mounted) {
      if (mounted.expands) {
        mounted.element.setAttribute(
          "aria-expanded",
          String(opener === mounted.element)
        );
      }
      mounted.update?.(state);
    }
    this.#updateOptions(state);
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

  // Close the open popover on any press outside the toolbar, e.g. on the canvas.
  // It listens before the press reaches the canvas, which keeps some to
  // itself, e.g. to pan.
  #onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!this.element.contains(target) && !this.options.contains(target)) {
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

  #togglePopover(popover: ToolbarPopover, takesFocus = true): void {
    const wasOpen = this.#openPopover?.key === popover.key;
    this.#closePopover();
    if (wasOpen) {
      return;
    }
    this.#openPopover = popover;
    this.#hideTooltip();
    this.update(this.#state);
    const content = popover.render();
    const close = () => this.#closePopover();
    this.#removePopover = popover.dialog
      ? showDialog(this.element, content, close)
      : showPopover(popover.opener, content, close, takesFocus);
    document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
  }

  // The tool whose options show: the one picked, or the one the dropper
  // picks a color for, if it has options and its button is on this toolbar.
  #getOptionsTool(state: CanvasToolbarState): Tool | null {
    const tool =
      state.activeTool === "dropper" ? state.previousTool : state.activeTool;
    return this.#tools.get(tool)?.options ? tool : null;
  }

  // Shows the picked tool's options, made again once another tool's picked,
  // or once the bar's on the page, if they were made before it was.
  #updateOptions(state: CanvasToolbarState): void {
    const tool = this.#getOptionsTool(state);
    if (
      tool !== this.#optionsTool ||
      (this.#optionsDetached && this.options.isConnected)
    ) {
      // A popover from the options, e.g. their color picker, goes with them.
      const opener = this.#openPopover?.opener;
      if (opener && this.options.contains(opener)) {
        this.#closePopover();
      }
      this.#optionsTool = tool;
      this.#optionsDetached = !this.options.isConnected;
      const bar = this.options;
      bar.replaceChildren();
      bar.hidden = tool === null;
      this.#toolOptions = null;
      const info = tool && this.#tools.get(tool);
      if (info?.options) {
        bar.setAttribute("aria-label", `${info.label} options`);
        this.#toolOptions = info.options(this.#host, bar);
      }
    }
    this.#toolOptions?.update(state);
  }
}
