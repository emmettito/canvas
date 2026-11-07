import {
  type CanvasToolbarActions,
  type CanvasToolbarState,
} from "../components/canvas-toolbar/canvas-toolbar";
import { type Tool } from "@emmettito/canvas";

/**
 * A control on a toolbar, made by one of the control functions, e.g.
 * `undoButton(icon)` or `zoomControl()`. Each control is its own import, so
 * a page's build only has the controls it uses.
 */
export interface ToolbarControl {
  /**
   * What it's called, e.g. "undo", which the toolbars can only list once. A
   * custom button's is null, since there can be any number of them.
   */
  readonly name: string | null;
  /** The tool it picks, if it's a tool's button. */
  readonly tool?: ToolbarTool;
  /** The items in its menu, if it's the file menu. */
  readonly items?: readonly FileMenuItem[];
  /** Makes its element, on the toolbar `host`. */
  readonly mount: (host: ToolbarHost) => MountedControl;
}

/**
 * An item in the file menu, made by one of the item functions, e.g.
 * `renameItem()`. Menu items are text, so they don't take icons.
 */
export interface FileMenuItem {
  /** What it's called, which the toolbars can only list once. */
  readonly name: string;
  readonly label: string;
  /** Whether it would do nothing, so it's disabled. */
  readonly isDisabled?: (state: CanvasToolbarState) => boolean;
  /** Does what it does. What it opens sits beside `opener`, the menu's button. */
  readonly select: (host: ToolbarHost, opener: HTMLElement) => void;
}

/** A tool a toolbar button picks. */
export interface ToolbarTool {
  readonly tool: Tool;
  /** Its name, e.g. for its options' bar. */
  readonly label: string;
  /** The key that picks it, e.g. "V", or "Shift+M" with Shift. */
  readonly shortcut: string;
  /**
   * Fills `bar` with its options, e.g. sizes and colors, which show while
   * it's picked. Without it, the tool has none.
   */
  readonly options?: (host: ToolbarHost, bar: HTMLElement) => ToolOptions;
}

/** A tool's options, in their bar. */
export interface ToolOptions {
  update: (state: CanvasToolbarState) => void;
}

/** A control's element on a toolbar. */
export interface MountedControl {
  readonly element: HTMLButtonElement;
  /** Whether it opens a popover, which is positioned against it. */
  readonly anchored?: boolean;
  /** Whether it says if what it opened is open, with `aria-expanded`. */
  readonly expands?: boolean;
  /** Shows the canvas's state, e.g. whether there's anything to undo. */
  readonly update?: (state: CanvasToolbarState) => void;
}

/** A popover a control opens. */
export interface ToolbarPopover {
  /** Which it is, so opening it again closes it. */
  readonly key: string;
  /** What it's positioned against. */
  readonly opener: HTMLElement;
  /** Shown as a dialog in the middle of the window, rather than beside it. */
  readonly dialog?: boolean;
  readonly render: () => Node;
}

/** What a control is given by the toolbar it's on. */
export interface ToolbarHost {
  /** The toolbar, e.g. to read the palette's CSS colors from. */
  readonly element: HTMLElement;
  readonly state: CanvasToolbarState;
  readonly actions: CanvasToolbarActions;
  readonly openPopover: ToolbarPopover | null;
  /**
   * Opens `popover`, closing any other, or closes it if it's open.
   * `takesFocus` is false to leave focus where it is, e.g. in text being
   * typed, when it's opened with the pointer.
   */
  togglePopover: (popover: ToolbarPopover, takesFocus?: boolean) => void;
  closePopover: () => void;
}

// What the zoom control's menu does.
export type ZoomAction = "in" | "out" | "reset" | "fit";
