import { COLORS } from "../../constants/colors.const";
import { DEFAULT_EXPORT_OPTIONS } from "../../constants/default-export-options.const";
import { DEFAULT_NOTE_COLOR } from "../../constants/default-note-color.const";
import { DEFAULT_TOOL_SIZES } from "../../constants/default-tool-sizes.const";
import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { ITEM_KINDS } from "../../constants/item-kinds.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { TOOL_SHORTCUTS } from "../../constants/tool-shortcuts.const";
import { TOOL_SIZES } from "../../constants/tool-sizes.const";
import { TOOLS } from "../../constants/tools.const";
import { type CanvasEntry } from "../../models/canvas-entry.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import { type Drawing } from "../../models/drawing.model";
import { type Point } from "../../models/point.model";
import {
  type ToolbarControl,
  type ZoomAction,
} from "../../models/toolbar-control.model";
import { type ToolState } from "../../models/tool-state.model";
import { type TextEditorFactory } from "../../models/text-editor.model";
import { type StrokeTool, type Tool } from "../../models/tool.model";
import { type Viewport } from "../../models/viewport.model";
import { CanvasStorage } from "../../utilities/canvas-storage";
import { createElement } from "../../utilities/create-element";
import { createId } from "../../utilities/create-id";
import { downloadBlob } from "../../utilities/download-blob";
import {
  addRecentColor,
  isCustomColor,
  isDarkColor,
  parseColor,
  readCssColor,
  resolveColor,
  toHex,
} from "../../utilities/colors";
import { DrawingHistory } from "../../utilities/drawing-history";
import { getCssVariable } from "../../utilities/get-css-variable";
import { EXPORT_EXTENSIONS } from "../../utilities/export-drawing";
import { getFileName } from "../../utilities/get-file-name";
import { getImageSize } from "../../utilities/get-image-size";
import { ImageStore } from "../../utilities/image-store";
import { isField } from "../../utilities/is-field";
import { getDefaultOrder, isOrderOf } from "../../utilities/layers";
import { DEFAULT_VIEWPORT } from "../../utilities/viewport";
import {
  CanvasToolbar,
  type CanvasToolbarActions,
  getToolbarActions,
  validateToolbar,
} from "../canvas-toolbar/canvas-toolbar";
import { Canvas, type Placing } from "../canvas/canvas";
import { plainTextEditor } from "../canvas/plain-text-editor";
import { Rulers } from "../rulers/rulers";
import { Toast } from "../toast/toast";
import "./canvas-wrapper.css";

// A blank canvas. It only goes into the history once it's changed.
function createEntry(): CanvasEntry {
  return { id: createId(), name: "", updatedAt: Date.now() };
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

// What canvases saved before they had their own background were drawn on.
const LEGACY_BACKGROUND = "#ffffff";

// How long scrolling or zooming has to pause before the view is saved, so
// it isn't saved for every step.
const VIEWPORT_SAVE_DELAY = 300;

// The zoom shortcuts' keys, by position, so they work on any layout:
// Ctrl+= or + zooms in, Ctrl+- out, Ctrl+0 or Shift+0 to 100%, and Shift+1 to
// fit, like Figma. Cmd on a Mac.
function getZoomShortcut(event: KeyboardEvent): ZoomAction | null {
  if (event.altKey) {
    return null;
  }
  const mod = event.ctrlKey || event.metaKey;
  switch (event.code) {
    case "Equal":
    case "NumpadAdd":
      return mod ? "in" : null;
    case "Minus":
    case "NumpadSubtract":
      return mod ? "out" : null;
    case "Digit0":
    case "Numpad0":
      return mod || event.shiftKey ? "reset" : null;
    case "Digit1":
      return event.shiftKey && !mod ? "fit" : null;
    default:
      return null;
  }
}

// Ctrl+\ on Windows and Linux, and Cmd+\ on a Mac. The key's position is
// used, so it works on keyboards where \ is elsewhere.
function isToggleShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === "Backslash" || event.key === "\\")
  );
}

// Cmd+Z undoes, and Cmd+Shift+Z or Ctrl+Y redoes. Ctrl rather than Cmd
// elsewhere. By letter, so Z is where the layout puts it.
function getHistoryShortcut(event: KeyboardEvent): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  switch (event.key.toLowerCase()) {
    case "z":
      return event.shiftKey ? "redo" : "undo";
    case "y":
      return event.shiftKey ? null : "redo";
    default:
      return null;
  }
}

// Shift+R, like Figma, while nothing's being typed.
function isRulersShortcut(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.repeat &&
    event.key.toUpperCase() === "R"
  );
}

export interface MountedCanvas {
  /**
   * Changes the open canvas's background, which can be undone like any other
   * change. Takes any solid CSS color, e.g. "#1f2023" or "red". Throws if
   * it isn't one, e.g. "transparent".
   */
  setBackground: (color: string) => void;
  /**
   * Changes who new notes are signed by, and who exports say made them, e.g.
   * once they've set their name. Notes already placed keep theirs. Empty for
   * nobody.
   */
  setAuthor: (name: string) => void;
  /**
   * Shows or hides who signed each note, on the canvas and in exports, e.g.
   * for a tidier canvas. Notes stay signed, so showing them again brings
   * their names back.
   */
  setShowAuthors: (show: boolean) => void;
  /** Removes the canvas and stops listening for events. */
  unmount: () => void;
}

// Which of the tool's sizes is closest to `size`.
function getNearestSize(tool: StrokeTool, size: number): number {
  return TOOL_SIZES[tool].reduce((nearest, each) =>
    Math.abs(each - size) < Math.abs(nearest - size) ? each : nearest
  );
}

export interface MountCanvasOptions {
  /**
   * Saves every change to local storage, under keys starting with this, along
   * with the toolbar settings, and reopens the last canvas on the next mount.
   * Images' files are saved in IndexedDB, under the same key, since they're
   * too big for local storage. Each canvas on a site needs its own key.
   * Without one, they only last until the page closes.
   */
  storageKey?: string;
  /**
   * The toolbar's controls, in groups, in order. Each button needs an icon.
   * Without this, there's no toolbar, so the pencil draws in black.
   */
  toolbar?: ToolbarControl[][];
  /**
   * Controls for a second toolbar, at the top left, in the same form as
   * `toolbar`, e.g. for saving and opening canvases. A control can be on one
   * toolbar or the other, not both.
   */
  topToolbar?: ToolbarControl[][];
  /**
   * Controls for a third toolbar, at the top right, in the same form, e.g.
   * for the zoom, apart from the drawing tools.
   */
  topRightToolbar?: ToolbarControl[][];
  /**
   * Called with the canvas's name as it mounts and whenever the name changes,
   * e.g. while it's typed or when another canvas is opened. It's empty for an
   * untitled canvas. Use it to show the name elsewhere, e.g. in the page's
   * title.
   */
  onNameChange?: (name: string) => void;
  /**
   * Called with the open canvas's background as it mounts and whenever the
   * background changes, e.g. when it's set, undone, or another canvas is
   * opened. Use it to show the background in your own picker, which changes
   * it with `setBackground`.
   */
  onBackgroundChange?: (color: string) => void;
  /**
   * Makes the editor notes and text are typed in with. Without one, they're
   * plain text. Pass `proseMirrorEditor` from `@emmettito/canvas/prosemirror`
   * to format them, or an editor of your own.
   */
  textEditor?: TextEditorFactory;
  /**
   * The name of whoever's drawing. New notes are signed with it, along their
   * bottom, and PNG and SVG exports keep it as their author. Change it with
   * `setAuthor`. Without one, nothing's signed.
   */
  author?: string;
  /**
   * Whether signed notes show who signed them, on the canvas and in exports.
   * Change it with `setShowAuthors`. Shown by default.
   */
  showAuthors?: boolean;
}

/**
 * Adds a canvas and its toolbars to `container`. The canvas fills the
 * container, so the host page decides its size, and the toolbars float above
 * it. Ctrl+\ (Cmd+\ on a Mac) hides and shows them. A container holds one
 * canvas, so unmount the existing one before mounting another.
 */
export function mountCanvas(
  container: HTMLElement,
  {
    storageKey,
    toolbar: controls = [],
    topToolbar: topControls = [],
    topRightToolbar: topRightControls = [],
    onNameChange,
    onBackgroundChange,
    textEditor = plainTextEditor,
    author: initialAuthor = "",
    showAuthors = true,
  }: MountCanvasOptions = {}
): MountedCanvas {
  // Two canvases would each try to fill the container.
  if (container.querySelector(":scope > .canvas-root")) {
    throw new Error("This container already has a canvas.");
  }
  // Checked together, so an action can only be on one.
  const allControls = [...topControls, ...topRightControls, ...controls];
  validateToolbar(allControls);
  // Without the history, there's only ever the open canvas, so starting a new
  // one deletes it.
  const offered = getToolbarActions(allControls);
  const hasHistory = offered.includes("history");
  // Only tools on a toolbar have a shortcut, or are picked for you, so a
  // host can leave one out.
  const shortcutTools = TOOLS.filter((tool) => offered.includes(tool));
  // In the page from the start, so its CSS can be read, e.g. the background
  // new canvases start with.
  const root = createElement("div", "canvas-root");
  container.append(root);
  const storage = new CanvasStorage(storageKey);
  const imageStore = new ImageStore(storageKey);
  const saved = storage.loadToolSettings();
  let author = initialAuthor.trim();
  let exportOptions = storage.loadExportOptions() ?? DEFAULT_EXPORT_OPTIONS;
  let activeTool: Tool = saved?.activeTool ?? "pencil";
  let noteColor: ToolColor = saved?.noteColor ?? DEFAULT_NOTE_COLOR;
  let recentColors: CustomColor[] = saved?.recentColors ?? [];
  // The tool the dropper goes back to, whose color it picks.
  let previousTool: Tool = activeTool;
  let textSize = saved?.textSize ?? TEXT_LAYOUT.defaultSize;
  // Sizes saved before each tool offered a few are the nearest one now.
  let tools: Record<StrokeTool, ToolState> = saved
    ? {
        eraser: {
          ...saved.tools.eraser,
          size: getNearestSize("eraser", saved.tools.eraser.size),
        },
        pencil: {
          ...saved.tools.pencil,
          size: getNearestSize("pencil", saved.tools.pencil.size),
        },
      }
    : {
        eraser: {
          color: undefined,
          size: DEFAULT_TOOL_SIZES.eraser,
        },
        pencil: {
          color: COLORS[0],
          size: DEFAULT_TOOL_SIZES.pencil,
        },
      };
  // Most recently edited first.
  let canvases = storage.loadCanvases();
  // The last one open, unless it was blank or has been deleted, e.g. in
  // another tab.
  const lastOpenId = storage.loadOpenCanvas();
  let open: CanvasEntry =
    canvases.find(({ id }) => id === lastOpenId) ?? createEntry();
  const history = new DrawingHistory(loadDrawing(open.id));
  fitPencilToBackground();
  // The drawing and name as of the last update, so an update can tell
  // whether they were changed.
  let lastDrawing: Drawing = history.drawing;
  let lastName = open.name;
  // What's in storage, so each part is only saved again once it changes, or
  // tried again after it couldn't be.
  let stored: Drawing = withStoredBackground(history.drawing, open.id);
  let storedViewport: Viewport =
    storage.loadViewport(open.id) ?? DEFAULT_VIEWPORT;
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  let storedCanvases = canvases;
  // False once an image's file couldn't be saved, e.g. storage was full.
  let imagesSaved = true;
  // The name the host was last told about, so it's only told of changes.
  // Null until it's told on mount.
  let reportedName: string | null = null;
  // The same for the background.
  let reportedBackground: string | null = null;
  // Where the pointer last was over the canvas, so a pasted image goes there.
  // Null while it's elsewhere.
  let pointer: Point | null = null;

  const canvasWrapper = createElement("div", "canvas-wrapper");
  // Only shown when a change couldn't be saved, e.g. because storage is full.
  const status = createElement("span", "canvas-status");
  status.setAttribute("role", "status");
  // For the image button. Images can also be pasted or dropped.
  const fileInput = createElement("input", "canvas-file-input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    void insertImages([...(fileInput.files ?? [])].filter(isImage));
    // Choosing the same file again should still insert it.
    fileInput.value = "";
  });
  // Says why something did nothing, e.g. the paint bucket.
  const toast = new Toast();
  const canvas = new Canvas(canvasWrapper, getStrokeToolState(), {
    onStrokeComplete: (stroke) => {
      history.addStroke(stroke);
      update();
    },
    onItemAdd: (kind, item) => {
      history.addItem(kind, item);
      update();
    },
    onItemChange: (kind, item) => {
      history.updateItem(kind, item);
      update();
    },
    onItemRemove: (kind, id) => {
      history.removeItem(kind, id);
      update();
    },
    onFill: (fill) => {
      history.addFill(fill);
      update();
    },
    onNothingToFill: () => toast.show("Nothing closed to fill"),
    onItemRestack: (kind, id, to) => {
      history.restackItem(kind, id, to);
      update();
    },
    getImage: (id) => imageStore.get(open.id, id),
    onViewportChange: () => {
      updateToolbars();
      rulers.refresh();
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(save, VIEWPORT_SAVE_DELAY);
    },
    createTextEditor: textEditor,
    onPickColor: (color) => {
      useColor(color);
      activeTool = previousTool;
      update();
    },
    onCustomColor: (color) => {
      recentColors = addRecentColor(recentColors, color);
      update();
    },
  });
  canvas.setViewport(storedViewport);
  canvas.setShowAuthors(showAuthors);
  showDrawing();
  const rulers = new Rulers({
    getViewport: () => canvas.viewport,
    // Where a new canvas starts, at the zoom it's at.
    onGoToOrigin: () => canvas.panTo({ x: 0, y: 0 }),
  });
  const toolbarActions: CanvasToolbarActions = {
    onUndo: () => {
      history.undo();
      update();
    },
    onRedo: () => {
      history.redo();
      update();
    },
    onClear: () => {
      history.clear();
      update();
    },
    onNewCanvas: () => {
      if (!hasHistory) {
        deleteCanvas(open.id);
      }
      openCanvas(createEntry());
    },
    onOpenCanvas: (id) => {
      const entry = canvases.find((canvas) => canvas.id === id);
      if (entry) {
        openCanvas(entry);
      }
    },
    onDeleteCanvas: (id) => {
      deleteCanvas(id);
      if (id === open.id) {
        openCanvas(canvases[0] ?? createEntry());
      } else {
        update();
      }
    },
    // The dropper is picked for a moment: picking it again, or a color with
    // it, goes back to the tool before it.
    onSelectTool: (tool) => {
      if (tool !== "dropper") {
        activeTool = tool;
      } else if (activeTool === "dropper") {
        activeTool = previousTool;
      } else {
        previousTool = activeTool;
        activeTool = "dropper";
      }
      update();
    },
    // A color picked while typing colors the text too, and typing goes on.
    onUpdateTool: (tool, values) => {
      const color = values.color && keepColor(values.color);
      tools = {
        ...tools,
        [tool]: { ...tools[tool], ...values, ...(color && { color }) },
      };
      if (color && canvas.isTyping) {
        canvas.colorTyping(resolveColor(root, color));
        canvas.focusTyping();
      }
      update();
    },
    onUpdateNoteColor: (color) => {
      noteColor = keepColor(color);
      canvas.focusTyping();
      update();
    },
    onUpdateTextSize: (size) => {
      textSize = size;
      update();
    },
    onInsertImage: () => fileInput.click(),
    onZoom: zoom,
    onToggleRulers: () => {
      showRulers(!rulers.shown);
      update();
    },
    onRename: (name) => {
      open = { ...open, name };
      update();
    },
    onExport: async (options) => {
      // The next export starts from these.
      exportOptions = options;
      storage.saveExportOptions(options);
      updateToolbars();
      const blob = await canvas.export(options, author);
      if (blob) {
        downloadBlob(
          blob,
          getFileName(open.name, EXPORT_EXTENSIONS[options.format])
        );
      }
    },
  };
  const toolbar = new CanvasToolbar(
    controls,
    getToolbarState(),
    toolbarActions
  );
  const topToolbar = new CanvasToolbar(
    topControls,
    getToolbarState(),
    toolbarActions,
    "top"
  );
  const topRightToolbar = new CanvasToolbar(
    topRightControls,
    getToolbarState(),
    toolbarActions,
    "top"
  );
  const toolbars = [toolbar, topToolbar, topRightToolbar];
  // The status sits beside the top right toolbar, rather than under it.
  const corner = createElement("div", "canvas-corner");
  corner.append(status);
  // The toast sits above the bottom toolbar, rather than over it.
  const bottom = createElement("div", "canvas-bottom");
  bottom.append(toast.element);
  root.append(canvasWrapper, rulers.element, corner, fileInput);
  canvas.zoomOnPinch(root);
  showRulers(saved?.rulers ?? false);
  const hasControls = (groups: ToolbarControl[][]) =>
    groups.some((group) => group.length > 0);
  if (hasControls(topControls)) {
    root.append(topToolbar.element);
  }
  if (hasControls(topRightControls)) {
    corner.append(topRightToolbar.element);
  }
  if (hasControls(controls)) {
    bottom.append(toolbar.element);
  }
  // Last, so the bottom toolbar is last to tab to, as it's last on screen.
  root.append(bottom);
  reportName();
  reportBackground();
  save();

  // Where the pointer is decides where a pasted image goes.
  canvasWrapper.addEventListener("pointermove", (event) => {
    pointer = canvas.getDrawingPoint(event.clientX, event.clientY);
    rulers.setPointer({ x: event.clientX, y: event.clientY });
  });
  canvasWrapper.addEventListener("pointerleave", () => {
    pointer = null;
    rulers.setPointer(null);
  });
  // Dropped image files are placed where they're dropped. Any other dropped
  // file is ignored, rather than the browser opening it in place of the page.
  canvasWrapper.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });
  canvasWrapper.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    void insertImages(
      [...event.dataTransfer.files].filter(isImage),
      canvas.getDrawingPoint(event.clientX, event.clientY)
    );
  });

  // A pasted image goes where the pointer is, if it's over the canvas, or in
  // the middle if the canvas has focus.
  function onPaste(event: ClipboardEvent) {
    if (
      isField(event.target) ||
      (pointer === null && !root.contains(document.activeElement))
    ) {
      return;
    }
    const files = [...(event.clipboardData?.files ?? [])].filter(isImage);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    void insertImages(files, pointer ?? undefined);
  }
  document.addEventListener("paste", onPaste);

  function zoom(action: ZoomAction) {
    if (action === "fit") {
      void canvas.zoomToFit();
    } else if (action === "reset") {
      canvas.zoomTo(1);
    } else {
      canvas.stepZoom(action);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    // Zooming takes the browser's own shortcuts, and tools' keys type, so
    // they're only used while the canvas is: with the pointer over it, or
    // focus in it or nowhere else.
    const zoomAction = getZoomShortcut(event);
    const active = document.activeElement;
    const inUse =
      !isField(event.target) &&
      (pointer !== null || root.contains(active) || active === document.body);
    if (zoomAction && inUse) {
      event.preventDefault();
      zoom(zoomAction);
      return;
    }
    // Text being typed in has its own history, which these undo instead.
    const historyAction = getHistoryShortcut(event);
    if (historyAction && inUse && !canvas.isTyping) {
      event.preventDefault();
      if (historyAction === "undo") {
        toolbarActions.onUndo();
      } else {
        toolbarActions.onRedo();
      }
      return;
    }
    // Like tools' keys, it types while text is typed in.
    if (isRulersShortcut(event) && inUse && !canvas.isTyping) {
      event.preventDefault();
      toolbarActions.onToggleRulers();
      return;
    }
    // [ and ] make the pencil or eraser smaller or bigger, like Photoshop's,
    // and type while text is typed in.
    const step = getSizeShortcut(event);
    if (step && inUse && !canvas.isTyping) {
      event.preventDefault();
      stepToolSize(step);
      return;
    }
    // Tools' keys are letters, which type while text is typed in.
    const tool = getToolShortcut(event);
    if (tool && inUse && !canvas.isTyping) {
      event.preventDefault();
      toolbarActions.onSelectTool(tool);
      return;
    }
    if (!isToggleShortcut(event)) {
      return;
    }
    event.preventDefault();
    const hidden = !root.hasAttribute("data-toolbars-hidden");
    root.toggleAttribute("data-toolbars-hidden", hidden);
    if (hidden) {
      for (const each of toolbars) {
        each.close();
      }
    }
  }
  document.addEventListener("keydown", onKeyDown);

  // A tool's key on its own picks it, e.g. V for the move tool.
  function getToolShortcut(event: KeyboardEvent): Tool | null {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      return null;
    }
    return (
      shortcutTools.find(
        (tool) => TOOL_SHORTCUTS[tool] === event.key.toUpperCase()
      ) ?? null
    );
  }

  // [ steps the size down and ] up, by position, so they work on any layout.
  function getSizeShortcut(event: KeyboardEvent): -1 | 1 | null {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return null;
    }
    return event.code === "BracketLeft"
      ? -1
      : event.code === "BracketRight"
        ? 1
        : null;
  }

  // The pencil's or eraser's next size, if one's picked, as long as there's
  // one that way.
  function stepToolSize(step: -1 | 1) {
    if (activeTool !== "pencil" && activeTool !== "eraser") {
      return;
    }
    const sizes = TOOL_SIZES[activeTool];
    const index = sizes.indexOf(tools[activeTool].size) + step;
    if (index >= 0 && index < sizes.length) {
      toolbarActions.onUpdateTool(activeTool, { size: sizes[index] });
    }
  }

  // A canvas's drawing. A blank canvas has nothing saved, so it starts empty.
  // Images' files that the drawing no longer has, e.g. ones deleted from it,
  // can't be brought back by undoing once it's opened again, so they're
  // removed.
  function loadDrawing(id: string): Drawing {
    const isSaved = canvases.some((canvas) => canvas.id === id);
    const parts = {
      strokes: storage.loadStrokes(id) ?? [],
      fills: storage.loadFills(id) ?? [],
      images: storage.loadItems(id, "images") ?? [],
      texts: storage.loadItems(id, "texts") ?? [],
      notes: storage.loadItems(id, "notes") ?? [],
    };
    // A canvas saved before it had a stacking order, or whose order doesn't
    // match, e.g. as part of it couldn't be saved, is stacked the way it used
    // to be.
    const order = storage.loadOrder(id);
    const drawing: Drawing = {
      ...parts,
      // A canvas saved before canvases had their own background was drawn on
      // white. A new one starts with the theme's.
      background:
        storage.loadBackground(id) ??
        (isSaved ? LEGACY_BACKGROUND : getDefaultBackground()),
      order: order && isOrderOf(order, parts) ? order : getDefaultOrder(parts),
    };
    void imageStore.prune(
      id,
      drawing.images.map((image) => image.id)
    );
    return drawing;
  }

  // Replaces what's being worked on, with nothing to undo. What it replaces
  // is already saved.
  function openCanvas(entry: CanvasEntry) {
    // The view being left is saved now, rather than after the delay.
    clearTimeout(viewportTimer);
    save();
    const drawing = loadDrawing(entry.id);
    open = entry;
    history.reset(drawing);
    lastDrawing = drawing;
    lastName = entry.name;
    stored = withStoredBackground(drawing, entry.id);
    fitPencilToBackground();
    storedViewport = storage.loadViewport(entry.id) ?? DEFAULT_VIEWPORT;
    canvas.setViewport(storedViewport);
    rulers.refresh();
    update();
  }

  // Removes a canvas from the history and storage.
  function deleteCanvas(id: string) {
    canvases = canvases.filter((canvas) => canvas.id !== id);
    storage.deleteCanvas(id);
    void imageStore.deleteCanvas(id);
  }

  // Inserts images one after another, from `at` or the middle of what the
  // canvas shows, each a little further down and right. The move tool is
  // picked, if there is one, with the last image, to move or resize it.
  async function insertImages(files: File[], at?: Point) {
    const { x, y, width, height } = canvas.visibleArea;
    const start = at ?? { x: x + width / 2, y: y + height / 2 };
    let last: string | null = null;
    for (const [index, file] of files.entries()) {
      const offset = index * IMAGE_LAYOUT.offset;
      last =
        (await insertImage(file, {
          x: start.x + offset,
          y: start.y + offset,
        })) ?? last;
    }
    if (last !== null && shortcutTools.includes("move")) {
      activeTool = "move";
      update();
      canvas.select("images", last);
    }
  }

  // Places an image centered on `center`, scaled down to fit the canvas. Its
  // file is kept as it is, so nothing is lost. Its id, or null if it isn't
  // an image a browser can show.
  async function insertImage(file: Blob, center: Point) {
    const size = await getImageSize(file);
    if (!size) {
      return null;
    }
    const id = createId();
    // The store has it as soon as it's asked, so the canvas can show it while
    // it's saved.
    const saving = imageStore.put(open.id, id, file);
    const room = canvas.drawingSize;
    const fit =
      room.width > 0 && room.height > 0
        ? Math.min(
            1,
            (room.width * IMAGE_LAYOUT.fit) / size.width,
            (room.height * IMAGE_LAYOUT.fit) / size.height
          )
        : 1;
    const width = size.width * fit;
    const height = size.height * fit;
    history.addItem("images", {
      id,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    });
    update();
    if (!(await saving)) {
      imagesSaved = false;
      save();
    }
    return id;
  }

  // A blank canvas isn't in the history until it's changed.
  function isInHistory(): boolean {
    return canvases.some(({ id }) => id === open.id);
  }

  function reportName() {
    if (open.name !== reportedName) {
      reportedName = open.name;
      onNameChange?.(open.name);
    }
  }

  function reportBackground() {
    const { background } = history.drawing;
    if (background !== reportedBackground) {
      reportedBackground = background;
      onBackgroundChange?.(background);
    }
  }

  // The rulers, with the toolbars moved clear of them.
  function showRulers(shown: boolean) {
    rulers.shown = shown;
    root.toggleAttribute("data-rulers", shown);
  }

  function updateToolbars() {
    const state = getToolbarState();
    for (const each of toolbars) {
      each.update(state);
    }
  }

  // The note and text tools draw nothing, so the canvas keeps the pencil's
  // settings while they're active.
  function getStrokeToolState(): ToolState {
    return tools[
      activeTool === "pencil" || activeTool === "eraser" ? activeTool : "pencil"
    ];
  }

  // The background new canvases start with, from the page's CSS, so a dark
  // theme can start them dark.
  function getDefaultBackground(): string {
    const value = getCssVariable(root, "--canvas-color-canvas");
    const channels = value ? parseColor(value) : null;
    return channels ? toHex(channels) : LEGACY_BACKGROUND;
  }

  // What's stored of `drawing`, so a background that isn't stored yet, e.g. a
  // new canvas's, is saved once the canvas is.
  function withStoredBackground(drawing: Drawing, id: string): Drawing {
    return {
      ...drawing,
      background: storage.loadBackground(id) ?? "",
      // The same for an order that's made up rather than loaded.
      order: storage.loadOrder(id) ?? [],
    };
  }

  // Changes the canvas's background, so it can be undone.
  function setBackground(color: string) {
    if (color !== history.drawing.background) {
      history.change({ ...history.drawing, background: color });
      fitPencilToBackground();
    }
    update();
  }

  // The pencil stays visible on a new background: black becomes white on a
  // dark one, and white black on a light one. Other colors are left as
  // they're picked.
  function fitPencilToBackground() {
    const dark = isDarkColor(history.drawing.background);
    const { color } = tools.pencil;
    const from = dark ? "--canvas-color-black" : "--canvas-color-white";
    const to = dark ? "--canvas-color-white" : "--canvas-color-black";
    if (color === from) {
      tools = { ...tools, pencil: { ...tools.pencil, color: to } };
    }
  }

  // Whose color the color control and the dropper set: new notes', or the
  // pencil's, which text uses too.
  function getColorTarget(): "pencil" | "note" {
    const tool = activeTool === "dropper" ? previousTool : activeTool;
    return tool === "note" ? "note" : "pencil";
  }

  // A custom color that's the palette's, e.g. "red" typed, is kept as the
  // palette's, so it follows the palette. Others are offered again.
  function keepColor(color: ToolColor): ToolColor {
    if (!isCustomColor(color)) {
      return color;
    }
    const palette = COLORS.find(
      (option) => toHex(parseColor(resolveColor(root, option)) ?? []) === color
    );
    if (palette) {
      return palette;
    }
    recentColors = addRecentColor(recentColors, color);
    return color;
  }

  function useColor(picked: ToolColor) {
    const color = keepColor(picked);
    if (getColorTarget() === "note") {
      noteColor = color;
    } else {
      tools = { ...tools, pencil: { ...tools.pencil, color } };
    }
  }

  // Text is in the pencil's color.
  function getPlacing(): Placing | null {
    if (activeTool === "note") {
      return { kind: "notes", color: noteColor, author };
    }
    if (activeTool === "text") {
      return {
        kind: "texts",
        color: tools.pencil.color ?? COLORS[0],
        fontSize: textSize,
      };
    }
    return null;
  }

  function getToolbarState() {
    return {
      activeTool,
      tools,
      noteColor,
      colorTarget: getColorTarget(),
      recentColors,
      textSize,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      canClear: history.canClear,
      // This one is blank, so a new canvas would be the same.
      canStartNew: isInHistory(),
      name: open.name,
      drawingSize: canvas.drawingSize,
      exportOptions,
      canvases,
      openCanvasId: open.id,
      zoom: canvas.viewport.zoom,
      rulers: rulers.shown,
    };
  }

  // Shows the drawing and the tool on the canvas.
  function showDrawing() {
    const { drawing } = history;
    for (const kind of ITEM_KINDS) {
      canvas.setItems(kind, drawing[kind]);
    }
    canvas.setLayers(drawing.strokes, drawing.order, drawing.fills);
    canvas.setBackground(drawing.background);
    canvas.setToolState(getStrokeToolState());
    canvas.setPlacing(getPlacing());
    canvas.setPicking(activeTool === "dropper");
    canvas.setMoving(activeTool === "move");
    canvas.setFilling(activeTool === "bucket");
    canvas.setRecentColors(recentColors);
  }

  function update() {
    const { drawing } = history;
    showDrawing();
    // Any change to the drawing, including undoing one, or to the name puts
    // the canvas at the top of the history, adding it if it was blank.
    if (drawing !== lastDrawing || open.name !== lastName) {
      lastDrawing = drawing;
      lastName = open.name;
      open = { ...open, updatedAt: Date.now() };
      canvases = [open, ...canvases.filter(({ id }) => id !== open.id)];
    }
    reportName();
    reportBackground();
    updateToolbars();
    save();
  }

  // Keeps everything as it is, so a refresh doesn't lose it, and says if any
  // of it couldn't be kept.
  function save() {
    let saved = storage.saveToolSettings({
      // The dropper is only picked for a moment, so the tool before it is
      // what's kept.
      activeTool: activeTool === "dropper" ? previousTool : activeTool,
      tools,
      noteColor,
      textSize,
      recentColors,
      rulers: rulers.shown,
    });
    if (canvases !== storedCanvases) {
      if (storage.saveCanvases(canvases)) {
        storedCanvases = canvases;
      } else {
        saved = false;
      }
    }
    // A blank canvas has nothing to keep.
    const inHistory = isInHistory();
    if (inHistory) {
      const { drawing } = history;
      if (drawing.background !== stored.background) {
        if (storage.saveBackground(open.id, drawing.background)) {
          stored = { ...stored, background: drawing.background };
        } else {
          saved = false;
        }
      }
      if (drawing.strokes !== stored.strokes) {
        if (storage.saveStrokes(open.id, drawing.strokes)) {
          stored = { ...stored, strokes: drawing.strokes };
        } else {
          saved = false;
        }
      }
      if (drawing.fills !== stored.fills) {
        if (storage.saveFills(open.id, drawing.fills)) {
          stored = { ...stored, fills: drawing.fills };
        } else {
          saved = false;
        }
      }
      if (drawing.order !== stored.order) {
        if (storage.saveOrder(open.id, drawing.order)) {
          stored = { ...stored, order: drawing.order };
        } else {
          saved = false;
        }
      }
      for (const kind of ITEM_KINDS) {
        if (drawing[kind] === stored[kind]) {
          continue;
        }
        if (storage.saveItems(open.id, kind, drawing[kind])) {
          stored = { ...stored, [kind]: drawing[kind] };
        } else {
          saved = false;
        }
      }
      const { viewport } = canvas;
      if (viewport !== storedViewport) {
        if (storage.saveViewport(open.id, viewport)) {
          storedViewport = viewport;
        } else {
          saved = false;
        }
      }
    }
    saved = storage.saveOpenCanvas(inHistory ? open.id : null) && saved;
    showSaved(saved && imagesSaved);
  }

  function showSaved(saved: boolean) {
    status.textContent = saved ? "" : "Couldn't save changes";
    status.toggleAttribute("data-shown", !saved);
  }

  // Observing the wrapper catches every size change, not just window resizes.
  const observer = new ResizeObserver(([entry]) => {
    const { height, width } = entry.contentRect;
    canvas.setSize(width, height);
    rulers.refresh();
    // The export's size follows the canvas's.
    updateToolbars();
  });
  observer.observe(canvasWrapper);

  return {
    setBackground: (value) => {
      const color = readCssColor(value);
      if (!color) {
        throw new Error(`"${value}" isn't a solid color.`);
      }
      setBackground(color);
    },
    setAuthor: (name) => {
      author = name.trim();
      canvas.setPlacing(getPlacing());
    },
    setShowAuthors: (show) => canvas.setShowAuthors(show),
    unmount: () => {
      // A view changed just before isn't lost.
      clearTimeout(viewportTimer);
      save();
      observer.disconnect();
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
      for (const each of toolbars) {
        each.destroy();
      }
      canvas.destroy();
      rulers.destroy();
      toast.destroy();
      root.remove();
    },
  };
}
