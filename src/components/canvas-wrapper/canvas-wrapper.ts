import { COLORS } from "../../constants/colors.const";
import { DEFAULT_EXPORT_OPTIONS } from "../../constants/default-export-options.const";
import { DEFAULT_NOTE_COLOR } from "../../constants/default-note-color.const";
import { DEFAULT_TOOL_SIZE } from "../../constants/default-tool-size.const";
import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { ITEM_KINDS } from "../../constants/item-kinds.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { type CanvasEntry } from "../../models/canvas-entry.model";
import { type Color } from "../../models/color.model";
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
import { DrawingHistory } from "../../utilities/drawing-history";
import { EXPORT_EXTENSIONS } from "../../utilities/export-drawing";
import { getFileName } from "../../utilities/get-file-name";
import { getImageSize } from "../../utilities/get-image-size";
import { ImageStore } from "../../utilities/image-store";
import { isField } from "../../utilities/is-field";
import { DEFAULT_VIEWPORT } from "../../utilities/viewport";
import {
  CanvasToolbar,
  type CanvasToolbarActions,
  getToolbarActions,
  validateToolbar,
} from "../canvas-toolbar/canvas-toolbar";
import { Canvas, type Placing } from "../canvas/canvas";
import { plainTextEditor } from "../canvas/plain-text-editor";
import "./canvas-wrapper.css";

// A blank canvas. It only goes into the history once it's changed.
function createEntry(): CanvasEntry {
  return { id: createId(), name: "", updatedAt: Date.now() };
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

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

export interface MountedCanvas {
  /** Removes the canvas and stops listening for events. */
  unmount: () => void;
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
   * Called with the canvas's name as it mounts and whenever the name changes,
   * e.g. while it's typed or when another canvas is opened. It's empty for an
   * untitled canvas. Use it to show the name elsewhere, e.g. in the page's
   * title.
   */
  onNameChange?: (name: string) => void;
  /**
   * Makes the editor notes and text are typed in with. Without one, they're
   * plain text. Pass `proseMirrorEditor` from `@emmettito/canvas/prosemirror`
   * to format them, or an editor of your own.
   */
  textEditor?: TextEditorFactory;
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
    onNameChange,
    textEditor = plainTextEditor,
  }: MountCanvasOptions = {}
): MountedCanvas {
  // Two canvases would each try to fill the container.
  if (container.querySelector(":scope > .canvas-root")) {
    throw new Error("This container already has a canvas.");
  }
  // Checked together, so an action can't be on both.
  validateToolbar([...topControls, ...controls]);
  // Without the history, there's only ever the open canvas, so starting a new
  // one deletes it.
  const hasHistory = getToolbarActions([...topControls, ...controls]).includes(
    "history"
  );
  const storage = new CanvasStorage(storageKey);
  const imageStore = new ImageStore(storageKey);
  const saved = storage.loadToolSettings();
  let exportOptions = storage.loadExportOptions() ?? DEFAULT_EXPORT_OPTIONS;
  let activeTool: Tool = saved?.activeTool ?? "pencil";
  let noteColor: Color = saved?.noteColor ?? DEFAULT_NOTE_COLOR;
  let textSize = saved?.textSize ?? TEXT_LAYOUT.defaultSize;
  let tools: Record<StrokeTool, ToolState> = saved?.tools ?? {
    eraser: {
      color: undefined,
      size: DEFAULT_TOOL_SIZE,
    },
    pencil: {
      color: COLORS[0],
      size: DEFAULT_TOOL_SIZE,
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
  // The drawing and name as of the last update, so an update can tell
  // whether they were changed.
  let lastDrawing: Drawing = history.drawing;
  let lastName = open.name;
  // What's in storage, so each part is only saved again once it changes, or
  // tried again after it couldn't be.
  let stored: Drawing = history.drawing;
  let storedViewport: Viewport =
    storage.loadViewport(open.id) ?? DEFAULT_VIEWPORT;
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  let storedCanvases = canvases;
  // False once an image's file couldn't be saved, e.g. storage was full.
  let imagesSaved = true;
  // The name the host was last told about, so it's only told of changes.
  // Null until it's told on mount.
  let reportedName: string | null = null;
  // Where the pointer last was over the canvas, so a pasted image goes there.
  // Null while it's elsewhere.
  let pointer: Point | null = null;

  const root = createElement("div", "canvas-root");
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
    getImage: (id) => imageStore.get(open.id, id),
    onViewportChange: () => {
      updateToolbars();
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(save, VIEWPORT_SAVE_DELAY);
    },
    createTextEditor: textEditor,
  });
  canvas.setViewport(storedViewport);
  showDrawing();
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
    onSelectTool: (tool) => {
      activeTool = tool;
      update();
    },
    onUpdateTool: (tool, values) => {
      tools = { ...tools, [tool]: { ...tools[tool], ...values } };
      update();
    },
    onUpdateNoteColor: (color) => {
      noteColor = color;
      update();
    },
    onUpdateTextSize: (size) => {
      textSize = size;
      update();
    },
    onInsertImage: () => fileInput.click(),
    onZoom: zoom,
    onRename: (name) => {
      open = { ...open, name };
      update();
    },
    onExport: async (options) => {
      // The next export starts from these.
      exportOptions = options;
      storage.saveExportOptions(options);
      updateToolbars();
      const blob = await canvas.export(options);
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
  root.append(canvasWrapper, status, fileInput);
  if (topControls.some((group) => group.length > 0)) {
    root.append(topToolbar.element);
  }
  if (controls.some((group) => group.length > 0)) {
    root.append(toolbar.element);
  }
  container.append(root);
  reportName();
  save();

  // Where the pointer is decides where a pasted image goes.
  canvasWrapper.addEventListener("pointermove", (event) => {
    pointer = canvas.getDrawingPoint(event.clientX, event.clientY);
  });
  canvasWrapper.addEventListener("pointerleave", () => {
    pointer = null;
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
      canvas.zoomToFit();
    } else if (action === "reset") {
      canvas.zoomTo(1);
    } else {
      canvas.stepZoom(action);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    // Zooming takes the browser's own shortcuts, so only while the canvas is
    // in use: with the pointer over it, or focus in it or nowhere else.
    const zoomAction = getZoomShortcut(event);
    const active = document.activeElement;
    if (
      zoomAction &&
      !isField(event.target) &&
      (pointer !== null || root.contains(active) || active === document.body)
    ) {
      event.preventDefault();
      zoom(zoomAction);
      return;
    }
    if (!isToggleShortcut(event)) {
      return;
    }
    event.preventDefault();
    const hidden = !root.hasAttribute("data-toolbars-hidden");
    root.toggleAttribute("data-toolbars-hidden", hidden);
    if (hidden) {
      toolbar.close();
      topToolbar.close();
    }
  }
  document.addEventListener("keydown", onKeyDown);

  // A canvas's drawing. A blank canvas has nothing saved, so it starts empty.
  // Images' files that the drawing no longer has, e.g. ones deleted from it,
  // can't be brought back by undoing once it's opened again, so they're
  // removed.
  function loadDrawing(id: string): Drawing {
    const drawing: Drawing = {
      strokes: storage.loadStrokes(id) ?? [],
      images: storage.loadItems(id, "images") ?? [],
      texts: storage.loadItems(id, "texts") ?? [],
      notes: storage.loadItems(id, "notes") ?? [],
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
    stored = drawing;
    storedViewport = storage.loadViewport(entry.id) ?? DEFAULT_VIEWPORT;
    canvas.setViewport(storedViewport);
    update();
  }

  // Removes a canvas from the history and storage.
  function deleteCanvas(id: string) {
    canvases = canvases.filter((canvas) => canvas.id !== id);
    storage.deleteCanvas(id);
    void imageStore.deleteCanvas(id);
  }

  // Inserts images one after another, from `at` or the middle of what the
  // canvas shows, each a little further down and right.
  async function insertImages(files: File[], at?: Point) {
    const { x, y, width, height } = canvas.visibleArea;
    const start = at ?? { x: x + width / 2, y: y + height / 2 };
    for (const [index, file] of files.entries()) {
      const offset = index * IMAGE_LAYOUT.offset;
      await insertImage(file, { x: start.x + offset, y: start.y + offset });
    }
  }

  // Places an image centered on `center`, scaled down to fit the canvas. Its
  // file is kept as it is, so nothing is lost.
  async function insertImage(file: Blob, center: Point) {
    const size = await getImageSize(file);
    if (!size) {
      return;
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

  function updateToolbars() {
    toolbar.update(getToolbarState());
    topToolbar.update(getToolbarState());
  }

  // The note and text tools draw nothing, so the canvas keeps the pencil's
  // settings while they're active.
  function getStrokeToolState(): ToolState {
    return tools[
      activeTool === "pencil" || activeTool === "eraser" ? activeTool : "pencil"
    ];
  }

  // Text is in the pencil's color.
  function getPlacing(): Placing | null {
    if (activeTool === "note") {
      return { kind: "notes", color: noteColor };
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
    };
  }

  // Shows the drawing and the tool on the canvas.
  function showDrawing() {
    const { drawing } = history;
    canvas.setStrokes(drawing.strokes);
    for (const kind of ITEM_KINDS) {
      canvas.setItems(kind, drawing[kind]);
    }
    canvas.setToolState(getStrokeToolState());
    canvas.setPlacing(getPlacing());
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
    updateToolbars();
    save();
  }

  // Keeps everything as it is, so a refresh doesn't lose it, and says if any
  // of it couldn't be kept.
  function save() {
    let saved = storage.saveToolSettings({
      activeTool,
      tools,
      noteColor,
      textSize,
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
      if (drawing.strokes !== stored.strokes) {
        if (storage.saveStrokes(open.id, drawing.strokes)) {
          stored = { ...stored, strokes: drawing.strokes };
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
    // The export's size follows the canvas's.
    updateToolbars();
  });
  observer.observe(canvasWrapper);

  return {
    unmount: () => {
      // A view changed just before isn't lost.
      clearTimeout(viewportTimer);
      save();
      observer.disconnect();
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
      toolbar.destroy();
      topToolbar.destroy();
      canvas.destroy();
      root.remove();
    },
  };
}
