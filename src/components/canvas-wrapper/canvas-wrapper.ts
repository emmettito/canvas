import { COLORS } from "../../constants/colors.const";
import { DEFAULT_EXPORT_OPTIONS } from "../../constants/default-export-options.const";
import { DEFAULT_NOTE_COLOR } from "../../constants/default-note-color.const";
import { DEFAULT_TOOL_SIZES } from "../../constants/default-tool-sizes.const";
import { HIGHLIGHTER } from "../../constants/highlighter.const";
import { IMAGE_LAYOUT } from "../../constants/image-layout.const";
import { ITEM_KINDS } from "../../constants/item-kinds.const";
import { TEXT_LAYOUT } from "../../constants/text-layout.const";
import { TIMER_LAYOUT } from "../../constants/timer-layout.const";
import { TOOL_SIZES } from "../../constants/tool-sizes.const";
import { TOOLS } from "../../constants/tools.const";
import {
  type PeerPointer,
  type PeerView,
  type SharedImage,
  type SharedTimer,
} from "../../collaboration-server";
import { type Activity } from "../../models/activity.model";
import { type CanvasEntry } from "../../models/canvas-entry.model";
import {
  type CanvasStore,
  type SavedCanvas,
} from "../../models/canvas-store.model";
import {
  type CanvasServerMessage,
  type CollaborationConnection,
} from "../../models/collaboration.model";
import { type CustomColor, type ToolColor } from "../../models/color.model";
import { type DrawingChange } from "../../models/drawing-change.model";
import {
  type Drawing,
  type DrawingItem,
  type ItemKind,
} from "../../models/drawing.model";
import { type History } from "../../models/history.model";
import { type Note } from "../../models/note.model";
import { type PersonName } from "../../models/person-name.model";
import { type Point } from "../../models/point.model";
import {
  type ToolbarControl,
  type ZoomAction,
} from "../../models/toolbar-control.model";
import { type ToolState } from "../../models/tool-state.model";
import { type Timer, type TimerSound } from "../../models/timer.model";
import { type TextEditorFactory } from "../../models/text-editor.model";
import { type Stroke } from "../../models/stroke.model";
import { type StrokeTool, type Tool } from "../../models/tool.model";
import {
  isStroke,
  readDrawing,
  readEntries,
  readExportOptions,
  readItem,
  readToolSettings,
  readViewport,
} from "../../utilities/read-saved";
import { moveStroke } from "../../utilities/stroke-shape";
import { createElement } from "../../utilities/create-element";
import { createId } from "../../utilities/create-id";
import {
  addRecentColor,
  isCustomColor,
  isDarkColor,
  parseColor,
  readCssColor,
  resolveColor,
  toHex,
} from "../../utilities/colors";
import { blobToDataUrl, dataUrlToBlob } from "../../utilities/data-url";
import { DrawingHistory } from "../../utilities/drawing-history";
import {
  type ColorFormats,
  DEFAULT_COLOR_FORMATS,
} from "../../utilities/color-formats";
import { getCssVariable } from "../../utilities/get-css-variable";
import { getImageSize } from "../../utilities/get-image-size";
import { createMemoryStore } from "../../utilities/memory-store";
import { isField } from "../../utilities/is-field";
import { isTimerSound, playTimerSound } from "../../utilities/play-timer-sound";
import { getDefaultOrder, isOrderOf } from "../../utilities/layers";
import {
  type ActivitySender,
  createActivitySender,
  isSharedActivity,
  receiveActivity,
} from "../../utilities/shared-activity";
import {
  getFullName,
  isSameName,
  trimName,
} from "../../utilities/person-names";
import { SharedHistory } from "../../utilities/shared-history";
import { upgradeDrawing } from "../../utilities/upgrade-drawing";
import { DEFAULT_VIEWPORT } from "../../utilities/viewport";
import {
  CanvasToolbar,
  type CanvasToolbarActions,
  type ColorTarget,
  getToolbarNames,
  getToolbarTools,
  validateToolbar,
} from "../canvas-toolbar/canvas-toolbar";
import { Canvas, type PickRef, type Placing } from "../canvas/canvas";
import { plainTextEditor } from "../canvas/plain-text-editor";
import { Presence } from "../presence/presence";
import { Rulers } from "../rulers/rulers";
import { Toast } from "../toast/toast";
import "./canvas-wrapper.css";

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

function isStrokeTool(tool: Tool): tool is StrokeTool {
  return tool === "pencil" || tool === "highlighter" || tool === "eraser";
}

// What new canvases are drawn on if the page's CSS doesn't say.
const DEFAULT_BACKGROUND = "#ffffff";

// How long scrolling or zooming has to pause before the view is saved, so
// it isn't saved for every step.
const VIEWPORT_SAVE_DELAY = 300;

// How often, at most, where the pointer is goes to everyone drawing
// together, in milliseconds, so moving it doesn't flood the room.
const POINTER_SHARE_DELAY = 50;

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

// What's picked, on the clipboard, which only canvases read.
const CLIPBOARD_TYPE = "application/x-canvas-items+json";

// Items copied, as they were, and the canvas they were copied from, whose
// images' files they need.
interface CopiedItems {
  canvas: string;
  items: { kind: ItemKind; item: DrawingItem<ItemKind> }[];
  // As they'd be on the drawing, wherever they were drawn.
  strokes: Stroke[];
}

// Items copied, from the clipboard, which may have come from another page,
// so each is checked like one read from storage. Null if there are none.
function readCopiedItems(data: string | undefined): CopiedItems | null {
  let value: unknown;
  try {
    value = data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("canvas" in value) ||
    typeof value.canvas !== "string" ||
    !("items" in value) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items.flatMap((each: unknown) => {
    const { kind, item } = (each ?? {}) as { kind?: unknown; item?: unknown };
    const read =
      ITEM_KINDS.includes(kind as ItemKind) && readItem(kind as ItemKind, item);
    return read ? [{ kind: kind as ItemKind, item: read }] : [];
  });
  const strokes =
    "strokes" in value && Array.isArray(value.strokes)
      ? (value.strokes as unknown[]).filter(
          (each): each is Stroke =>
            isStroke(each) && each.color !== undefined && !!each.id
        )
      : [];
  return items.length > 0 || strokes.length > 0
    ? { canvas: value.canvas, items, strokes }
    : null;
}

// Ctrl+A (Cmd on a Mac) to pick everything, and Ctrl+D to copy what's
// picked.
function getPickShortcut(event: KeyboardEvent): "all" | "duplicate" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return null;
  }
  switch (event.key.toLowerCase()) {
    case "a":
      return "all";
    case "d":
      return "duplicate";
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
   * once they've set their name. Notes already placed keep theirs. Empty
   * first and last names for nobody.
   */
  setAuthor: (name: PersonName) => void;
  /**
   * Changes the photo shown for whoever's drawing to everyone drawing
   * together with them, e.g. once they've picked one. Takes an image's data
   * URL, or an https address. Empty for none, which shows their initial.
   */
  setAvatar: (url: string) => void;
  /**
   * Shows or hides who signed each note, on the canvas and in exports, e.g.
   * for a tidier canvas. Notes stay signed, so showing them again brings
   * their names back.
   */
  setShowAuthors: (show: boolean) => void;
  /** The open canvas's id, e.g. to draw on it together as a room. */
  readonly canvasId: string;
  /**
   * Resolves once every change so far is saved, e.g. before leaving the page,
   * with whether they all were.
   */
  whenSaved: () => Promise<boolean>;
  /**
   * Draws together with everyone in `room`, through `connection`. The canvas
   * with the room's id opens, or a new one with it, and joins the room, which
   * starts from this canvas's drawing if nobody's in it yet. Everyone's
   * changes show as they're made, with each person's pointer and name, and
   * undo only undoes this canvas's own changes. It's kept like any other
   * canvas, so it's there to open again on its own. Returns a function that
   * leaves the room. Opening another canvas leaves it too.
   */
  collaborate: (
    connection: CollaborationConnection,
    options: CollaborateOptions
  ) => () => void;
  /** Removes the canvas and stops listening for events. */
  unmount: () => void;
}

export interface CollaborateOptions {
  /** The room to join, which is also the id of the canvas it's kept as. */
  room: string;
  /**
   * Called once the canvas leaves the room, however it does, e.g. as another
   * canvas is opened.
   */
  onLeave?: () => void;
}

// Which of the tool's sizes is closest to `size`.
function getNearestSize(tool: StrokeTool, size: number): number {
  return TOOL_SIZES[tool].reduce((nearest, each) =>
    Math.abs(each - size) < Math.abs(nearest - size) ? each : nearest
  );
}

export interface MountCanvasOptions {
  /**
   * Where canvases are kept, e.g. the page's server, which every change is
   * saved to as it's made. Without one, they're kept in memory, so they only
   * last until the page closes.
   */
  store?: CanvasStore;
  /**
   * The canvas to open, from `store`, or a new one with this id if it has
   * none. Without one, a new canvas opens, with an id of its own.
   */
  canvasId?: string;
  /**
   * Called with a canvas's id as it opens, e.g. from History, so the page
   * can open it again next time.
   */
  onOpenCanvas?: (id: string) => void;
  /**
   * The tool settings, e.g. the pencil's color and size, and the export
   * options, as `onSettingsChange` last gave them. They're shared by every
   * canvas.
   */
  settings?: unknown;
  /**
   * Called with the settings as they mount and whenever they change, as
   * JSON to keep, e.g. in local storage, and pass back as `settings`.
   */
  onSettingsChange?: (settings: unknown) => void;
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
   * The first and last name of whoever's drawing. New notes are signed with
   * it, along their bottom, by first name unless someone else who signed
   * has it too, and PNG and SVG exports keep it whole as their author.
   * Everyone drawing together sees it by their pointer the same way. Change
   * it with `setAuthor`. Without one, nothing's signed.
   */
  author?: PersonName;
  /**
   * The photo of whoever's drawing, shown to everyone drawing together with
   * them, as an image's data URL or an https address. Change it with
   * `setAvatar`. Without one, their initial shows instead.
   */
  avatar?: string;
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
    store = createMemoryStore(),
    canvasId,
    onOpenCanvas,
    settings,
    onSettingsChange,
    toolbar: controls = [],
    topToolbar: topControls = [],
    topRightToolbar: topRightControls = [],
    onNameChange,
    onBackgroundChange,
    textEditor = plainTextEditor,
    author: initialAuthor = { firstName: "", lastName: "" },
    avatar: initialAvatar = "",
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
  const hasHistory = getToolbarNames(allControls).includes("history");
  if (hasHistory && (!store.listCanvases || !store.deleteCanvas)) {
    throw new Error("History needs a store that lists and deletes canvases.");
  }
  // Only tools on a toolbar have a shortcut, or are picked for you, so a
  // host can leave one out. Each tool's button has its key.
  const shortcuts = new Map(
    getToolbarTools(allControls).map(({ tool, shortcut }) => [tool, shortcut])
  );
  const shortcutTools = TOOLS.filter((tool) => shortcuts.has(tool));
  // In the page from the start, so its CSS can be read, e.g. the background
  // new canvases start with.
  const root = createElement("div", "canvas-root");
  container.append(root);
  const saved = readToolSettings(settings);
  let author = trimName(initialAuthor);
  let avatar = initialAvatar;
  let exportOptions =
    readExportOptions(
      typeof settings === "object" && settings !== null
        ? (settings as { export?: unknown }).export
        : null
    ) ?? DEFAULT_EXPORT_OPTIONS;
  // A tool that isn't on a toolbar any more, e.g. one the page took off, is
  // put down for the pencil, or else the first tool there is.
  let activeTool: Tool =
    saved && shortcutTools.includes(saved.activeTool)
      ? saved.activeTool
      : shortcutTools.includes("pencil") || shortcutTools.length === 0
        ? "pencil"
        : shortcutTools[0];
  let bucketColor: ToolColor = saved?.bucketColor ?? COLORS[0];
  let noteColor: ToolColor = saved?.noteColor ?? DEFAULT_NOTE_COLOR;
  let recentColors: CustomColor[] = saved?.recentColors ?? [];
  let colorFormats: ColorFormats = saved?.colorFormats ?? DEFAULT_COLOR_FORMATS;
  // The color of the note being typed in, which its tool's options show.
  let typingNoteColor: string | null = null;
  // The tool the dropper goes back to, whose color it picks.
  let previousTool: Tool = activeTool;
  let textSize = saved?.textSize ?? TEXT_LAYOUT.defaultSize;
  // Sizes saved before the tools offered the same few are the nearest one
  // now.
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
        highlighter: {
          ...saved.tools.highlighter,
          size: getNearestSize("highlighter", saved.tools.highlighter.size),
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
        highlighter: {
          color: HIGHLIGHTER.color,
          size: DEFAULT_TOOL_SIZES.highlighter,
        },
      };
  // Most recently edited first, once the store's listed them, for History.
  // Those changed since it mounted come first.
  let canvases: CanvasEntry[] = [];
  // Deleted since it mounted, so a list that comes after leaves them out.
  const deleted = new Set<string>();
  // Blank until the canvas it opens with is loaded.
  let open: CanvasEntry = {
    id: canvasId ?? createId(),
    name: "",
    updatedAt: Date.now(),
  };
  // Whether the open canvas is kept: one that's blank isn't until it's
  // changed.
  let openSaved = false;
  // While a canvas is being opened, which the canvas can't be drawn on
  // until it is, and what opens.
  let loading = false;
  let openToken = 0;
  let opening: Promise<void> = Promise.resolve();
  // Set once it's unmounted, so what the store answers after isn't shown.
  let unmounted = false;
  let openingId = open.id;
  // Replaced by a shared one while drawing together.
  let history: History = new DrawingHistory(createBlankDrawing());
  // Drawing together with others in a room, or null while drawing alone.
  // Its history is null until the room has sent what's been drawn so far.
  let session: {
    room: string;
    connection: CollaborationConnection;
    stopListening: () => void;
    history: SharedHistory | null;
    // This canvas's id in the room, once it's joined.
    me: string | null;
    // What this canvas is in the middle of, as it's sent, and what everyone
    // else is, by their id.
    activity: ActivitySender;
    peerActivities: Map<string, Activity>;
    onLeave?: () => void;
  } | null = null;
  // Set while where the pointer is is waiting to be shared.
  let pointerTimer: ReturnType<typeof setTimeout> | undefined;
  // What the pointer was last shared pointing with.
  let sharedTool: Pick<PeerPointer, "tool" | "size"> = {};
  // The same for what the canvas shows.
  let viewTimer: ReturnType<typeof setTimeout> | undefined;
  // The timer while it's going, which goes off for everyone drawing
  // together, and what the next one starts with.
  let timer: Timer | null = null;
  let timerTick: ReturnType<typeof setInterval> | undefined;
  let timerDuration = TIMER_LAYOUT.defaultDuration;
  let timerSound: TimerSound = TIMER_LAYOUT.defaultSound;
  fitPencilToBackground();
  // The drawing and name as of the last update, so an update can tell
  // whether they were changed.
  let lastDrawing: Drawing = history.drawing;
  let lastName = open.name;
  // What was last given to the store, so the canvas is only saved again once
  // it changes, or tried again after it couldn't be. Null if it hasn't been.
  let stored: SavedCanvas | null = null;
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  // Canvases waiting to be saved, by id, so only the latest of each is. One
  // is saved at a time, in turn, along with deleting them.
  const unsaved = new Map<string, SavedCanvas>();
  let saving: Promise<void> = Promise.resolve();
  let saveQueued = false;
  // False once the open canvas or an image's file couldn't be saved, or the
  // canvas couldn't be opened.
  let canvasSaved = true;
  let imagesSaved = true;
  let opened = true;
  // Images' files, by image id, with the canvas each is in, so they're there
  // straight away, even while they're being saved.
  const imageFiles = new Map<string, { canvasId: string; file: Blob }>();
  const imageSaves = new Set<Promise<boolean>>();
  // The settings the page was last given, as JSON, so it's only given them
  // again once they change.
  let reportedSettings: string | null = null;
  // The name the host was last told about, so it's only told of changes.
  // Null until it's told on mount.
  let reportedName: string | null = null;
  // The same for the background.
  let reportedBackground: string | null = null;
  // Where the pointer last was over the canvas, so a pasted image goes there.
  // Null while it's elsewhere.
  let pointer: Point | null = null;
  // How many times what was copied last has been pasted, so each paste goes
  // a little further on.
  let pastes = 0;

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
      history.updateItem(kind, kind === "notes" ? sign(item as Note) : item);
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
    onBatch: (changes) => {
      // A note can gain or lose strokes along with everything else.
      history.batch(
        changes.map((change) =>
          change.type === "update-item" && change.kind === "notes"
            ? { ...change, fields: sign(change.fields as Note) }
            : change
        )
      );
      update();
    },
    getImage: (id) => loadImageFile(open.id, id),
    // Moving around stops following whoever's followed.
    onViewportChange: () => {
      if (presence.following) {
        follow(null);
      }
      shareView();
      updateToolbars();
      rulers.refresh();
      presence.refresh();
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
    onColorFormat: (format) => {
      colorFormats = { ...colorFormats, text: format };
      update();
    },
    onActivity: (activity) => {
      if (session?.history) {
        session.activity.set(activity);
      }
    },
    onEditingNote: (color) => {
      typingNoteColor = color;
      updateToolbars();
    },
  });
  canvas.setShowAuthors(showAuthors);
  showDrawing();
  const rulers = new Rulers({
    getViewport: () => canvas.viewport,
    // Where a new canvas starts, at the zoom it's at.
    onGoToOrigin: () => canvas.panTo({ x: 0, y: 0 }),
  });
  // Who else is here, while drawing together.
  const presence = new Presence({
    getViewport: () => canvas.viewport,
    onFollow: follow,
    onSummon: () => session?.connection.send({ type: "summon" }),
    onRelease: (id) => session?.connection.send({ type: "release", id }),
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
      void openCanvas(createId(), false);
    },
    onOpenCanvas: (id) => {
      if (canvases.some((canvas) => canvas.id === id)) {
        void openCanvas(id);
      }
    },
    onDeleteCanvas: (id) => {
      deleteCanvas(id);
      if (id === open.id) {
        void (canvases[0]
          ? openCanvas(canvases[0].id)
          : openCanvas(createId(), false));
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
    // A custom color is a note's own, rather than a light shade of it like
    // the palette's, even if it's a palette color. The note being typed in
    // changes to it too.
    onUpdateNoteColor: (color) => {
      noteColor = keepColor(color, false);
      canvas.colorTypingNote(noteColor);
      canvas.focusTyping();
      update();
    },
    onUpdateBucketColor: (color) => {
      bucketColor = keepColor(color);
      update();
    },
    onUpdateColorFormat: (target, format) => {
      colorFormats = { ...colorFormats, [target]: format };
      update();
    },
    onInsertImage: () => fileInput.click(),
    onZoom: zoom,
    onToggleRulers: () => {
      showRulers(!rulers.shown);
      update();
    },
    // While drawing together, the room starts and stops it for everyone,
    // including this canvas.
    onStartTimer: (duration, sound) => {
      timerDuration = duration;
      timerSound = sound;
      if (session?.history) {
        session.connection.send({ type: "timer", timer: { duration, sound } });
      } else {
        setTimer({ endsAt: Date.now() + duration, duration, sound, by: null });
      }
    },
    onStopTimer: () => {
      if (session?.history) {
        session.connection.send({ type: "timer", timer: null });
      } else {
        setTimer(null);
      }
    },
    onRename: (name) => {
      open = { ...open, name };
      update();
    },
    getExportSource: () => canvas.getExportSource(),
    // The next export starts from these.
    onExportOptions: (options) => {
      exportOptions = options;
      saveSettings();
      updateToolbars();
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
  // Each toolbar's tools' options are in a bar beside it, toward the canvas.
  topToolbar.options.classList.add("canvas-top-options");
  // The status sits beside the top right toolbar, rather than under it.
  const corner = createElement("div", "canvas-corner");
  // Who's here starts the top right toolbar.
  topRightToolbar.element.prepend(presence.element);
  corner.append(status);
  // The toast sits above the bottom toolbar, rather than over it.
  const bottom = createElement("div", "canvas-bottom");
  bottom.append(toast.element);
  root.append(
    canvasWrapper,
    presence.cursors,
    rulers.element,
    corner,
    presence.followBar,
    fileInput
  );
  canvas.zoomOnPinch(root);
  showRulers(saved?.rulers ?? false);
  const hasControls = (groups: ToolbarControl[][]) =>
    groups.some((group) => group.length > 0);
  if (hasControls(topControls)) {
    root.append(topToolbar.element, topToolbar.options);
  }
  placeTopRightToolbar();
  if (hasControls(controls)) {
    bottom.append(toolbar.options, toolbar.element);
  }
  // Last, so the bottom toolbar is last to tab to, as it's last on screen.
  root.append(bottom);
  // The toolbars' options were made before they were on the page, so they're
  // made again now their colors can be read.
  updateToolbars();
  reportName();
  reportBackground();
  // A new canvas is blank, so there's nothing to load.
  void openCanvas(open.id, canvasId !== undefined);
  if (hasHistory) {
    store.listCanvases!().then(
      (listed) => {
        if (unmounted) {
          return;
        }
        const known = new Set(canvases.map(({ id }) => id));
        canvases = [
          ...canvases,
          ...readEntries(listed).filter(
            ({ id }) => !known.has(id) && !deleted.has(id)
          ),
        ];
        updateToolbars();
      },
      // History only has those opened since, until it's mounted again.
      () => {}
    );
  }

  // Where the pointer is decides where a pasted image goes.
  canvasWrapper.addEventListener("pointermove", (event) => {
    pointer = canvas.getDrawingPoint(event.clientX, event.clientY);
    rulers.setPointer({ x: event.clientX, y: event.clientY });
    sharePointer();
  });
  canvasWrapper.addEventListener("pointerleave", () => {
    pointer = null;
    rulers.setPointer(null);
    sharePointer();
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

  // Whether copying, cutting or pasting is for the canvas: with the pointer
  // over it or focus in it, and nothing being typed.
  function isClipboardForCanvas(event: ClipboardEvent): boolean {
    return (
      !isField(event.target) &&
      !canvas.isTyping &&
      (pointer !== null || root.contains(document.activeElement))
    );
  }

  // What's picked, as it is, from this canvas, for pasting.
  function getPicked(): CopiedItems | null {
    const items = canvas.selection.flatMap((ref) => {
      if (ref.kind === "strokes") {
        return [];
      }
      const { kind, id } = ref;
      const item = (history.drawing[kind] as DrawingItem<ItemKind>[]).find(
        (each) => each.id === id
      );
      return item ? [{ kind, item }] : [];
    });
    const strokes = canvas.pickedStrokes;
    return items.length > 0 || strokes.length > 0
      ? { canvas: open.id, items, strokes }
      : null;
  }

  // What's picked is copied to the clipboard, to paste on this canvas or
  // another, even in another tab.
  function onCopy(event: ClipboardEvent) {
    const picked = isClipboardForCanvas(event) && getPicked();
    if (!picked || !event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(picked));
    pastes = 0;
  }
  document.addEventListener("copy", onCopy);

  function onCut(event: ClipboardEvent) {
    onCopy(event);
    if (event.defaultPrevented) {
      canvas.deleteSelection();
    }
  }
  document.addEventListener("cut", onCut);

  // Items pasted go a little further down and right each time, so they don't
  // hide what they were copied from, or each other, and are picked, to move
  // them. A pasted image goes where the pointer is, if it's over the canvas,
  // or in the middle if the canvas has focus.
  function onPaste(event: ClipboardEvent) {
    if (
      isField(event.target) ||
      (pointer === null && !root.contains(document.activeElement))
    ) {
      return;
    }
    const copied = readCopiedItems(
      event.clipboardData?.getData(CLIPBOARD_TYPE)
    );
    if (copied && !canvas.isTyping) {
      event.preventDefault();
      pastes++;
      void pasteItems(copied, IMAGE_LAYOUT.offset * pastes);
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

  // Adds copies of `copied`'s items, `offset` further down and right, above
  // everything, as one change, with new ids, and picks them, with the move
  // tool if there is one. An image's file comes from the canvas it was
  // copied from, and one that can't be found is left out.
  async function pasteItems(copied: CopiedItems, offset: number) {
    const changes: DrawingChange[] = [];
    const pasted: PickRef[] = [];
    for (const stroke of copied.strokes) {
      const id = createId();
      changes.push({
        type: "add-stroke",
        stroke: { ...moveStroke(stroke, offset, offset), id },
      });
      pasted.push({ kind: "strokes", id, note: null });
    }
    for (const { kind, item } of copied.items) {
      const id = createId();
      if (kind === "images") {
        const file = await loadImageFile(copied.canvas, item.id);
        if (!file || !(await shareImageFile(id, file))) {
          continue;
        }
      }
      changes.push({
        type: "add-item",
        kind,
        item: { ...item, id, x: item.x + offset, y: item.y + offset },
      });
      pasted.push({ kind, id });
    }
    if (changes.length === 0) {
      return;
    }
    history.batch(changes);
    if (shortcutTools.includes("select")) {
      activeTool = "select";
    }
    update();
    canvas.setSelection(pasted);
  }

  // Keeps an image's file, under `id`, and gives it to everyone drawing
  // together, before the image, so it shows as soon as the image does.
  // Whether it was kept.
  async function shareImageFile(id: string, file: Blob): Promise<boolean> {
    void saveImageFile(open.id, id, file);
    const data = session?.history && (await blobToDataUrl(file));
    if (data) {
      session?.connection.send({ type: "image", image: { id, data } });
    }
    return true;
  }

  // An image's file, from those kept in memory, or else the store. Null if
  // there's none, or it can't be loaded.
  async function loadImageFile(
    canvasId: string,
    id: string
  ): Promise<Blob | null> {
    const kept = imageFiles.get(id);
    if (kept) {
      return kept.file;
    }
    const file = await store.loadImage(canvasId, id).catch(() => null);
    if (file instanceof Blob) {
      imageFiles.set(id, { canvasId, file });
      return file;
    }
    return null;
  }

  // Keeps an image's file, in memory straight away, so it shows while it's
  // saved, and in the store. Whether it was saved, which the canvas says if
  // it wasn't.
  function saveImageFile(
    canvasId: string,
    id: string,
    file: Blob
  ): Promise<boolean> {
    imageFiles.set(id, { canvasId, file });
    const saved = store.saveImage(canvasId, id, file).then(
      () => true,
      () => false
    );
    imageSaves.add(saved);
    void saved.then((ok) => {
      imageSaves.delete(saved);
      if (!ok) {
        imagesSaved = false;
        showSaved();
      }
    });
    return saved;
  }

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
    // Nothing's changed while a canvas opens, since it'd be lost as it does.
    if (loading) {
      return;
    }
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
    // Ctrl+A picks every item, and Ctrl+D copies what's picked, in place of
    // the browser's selecting the page and bookmarking it.
    const pickAction = getPickShortcut(event);
    if (pickAction && inUse && !canvas.isTyping) {
      if (pickAction === "all" && shortcutTools.includes("select")) {
        event.preventDefault();
        activeTool = "select";
        update();
        canvas.selectAll();
      } else if (pickAction === "duplicate") {
        const picked = getPicked();
        if (picked) {
          event.preventDefault();
          void pasteItems(picked, IMAGE_LAYOUT.offset);
        }
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
    // A stroke picked has no focus to take these from, as an item does.
    if (
      inUse &&
      !canvas.isTyping &&
      !event.defaultPrevented &&
      canvas.selection.some(({ kind }) => kind === "strokes")
    ) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        canvas.deleteSelection();
        return;
      }
      if (event.key === "Escape") {
        canvas.pickLess();
        return;
      }
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

  // A tool's key on its own, or with Shift, picks it, e.g. V for the select
  // tool.
  function getToolShortcut(event: KeyboardEvent): Tool | null {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      return null;
    }
    const key = `${event.shiftKey ? "Shift+" : ""}${event.key.toUpperCase()}`;
    return shortcutTools.find((tool) => shortcuts.get(tool) === key) ?? null;
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

  // The picked stroke tool's next size, as long as there's one that way.
  function stepToolSize(step: -1 | 1) {
    if (!isStrokeTool(activeTool)) {
      return;
    }
    const sizes = TOOL_SIZES[activeTool];
    const index = sizes.indexOf(tools[activeTool].size) + step;
    if (index >= 0 && index < sizes.length) {
      toolbarActions.onUpdateTool(activeTool, { size: sizes[index] });
    }
  }

  // A blank drawing, on the theme's background.
  function createBlankDrawing(): Drawing {
    return {
      background: getDefaultBackground(),
      strokes: [],
      fills: [],
      erasers: [],
      images: [],
      texts: [],
      notes: [],
      order: [],
    };
  }

  // A canvas's drawing, as it was saved. A part that isn't valid is left out,
  // rather than breaking the rest. `changed` if it isn't as it was saved,
  // e.g. it's been upgraded, so it's saved again.
  function readSavedDrawing(value: unknown): {
    drawing: Drawing;
    changed: boolean;
  } {
    const { order, background, ...saved } = readDrawing(value);
    const parts = {
      strokes: saved.strokes ?? [],
      fills: saved.fills ?? [],
      erasers: saved.erasers ?? [],
      images: saved.images ?? [],
      texts: saved.texts ?? [],
      notes: saved.notes ?? [],
    };
    // A canvas saved before it had a stacking order, or whose order doesn't
    // match, is stacked the way it used to be.
    const ordered = order !== null && isOrderOf(order, parts);
    const drawing: Drawing = {
      ...parts,
      background: background ?? getDefaultBackground(),
      order: ordered ? order : getDefaultOrder(parts),
    };
    const upgraded = upgradeDrawing(drawing);
    return {
      drawing: upgraded,
      changed:
        upgraded !== drawing ||
        !ordered ||
        background === null ||
        Object.values(saved).includes(null),
    };
  }

  // Replaces what's being worked on with the canvas `id`, from the store, or
  // a blank one with that id if it has none, or if `load` is false, e.g. for
  // a new one. There's nothing to undo. What it replaces is saved first.
  // Until it's loaded, the canvas can't be drawn on, and if it can't be, it
  // says so and stays that way, rather than lose what was saved.
  function openCanvas(id: string, load = true): Promise<void> {
    if (session && id !== session.room) {
      leaveRoom();
    }
    // The view being left is saved now, rather than after the delay.
    clearTimeout(viewportTimer);
    save();
    const token = ++openToken;
    openingId = id;
    if (!load) {
      showCanvas(id, null);
      opening = Promise.resolve();
      return opening;
    }
    setLoading(true);
    opening = store.loadCanvas(id).then(
      (loaded) => {
        if (token === openToken) {
          showCanvas(id, loaded);
        }
      },
      () => {
        if (token === openToken) {
          opened = false;
          showSaved();
        }
      }
    );
    return opening;
  }

  // Shows the canvas `id`, as it was `loaded`, or blank.
  function showCanvas(id: string, loaded: SavedCanvas | null) {
    const read = loaded && readSavedDrawing(loaded.drawing);
    const drawing = read ? read.drawing : createBlankDrawing();
    open = {
      id,
      name: typeof loaded?.name === "string" ? loaded.name : "",
      updatedAt:
        typeof loaded?.updatedAt === "number" ? loaded.updatedAt : Date.now(),
    };
    openSaved = loaded !== null;
    opened = true;
    canvasSaved = true;
    history = new DrawingHistory(drawing);
    lastDrawing = drawing;
    lastName = open.name;
    fitPencilToBackground();
    canvas.setViewport(readViewport(loaded?.viewport) ?? DEFAULT_VIEWPORT);
    // What was loaded is already saved, unless it's been upgraded, or
    // there's no drawing yet, e.g. one the page made, which is saved with its
    // background.
    stored =
      loaded && read && !read.changed
        ? { ...open, drawing, viewport: canvas.viewport }
        : null;
    if (loaded) {
      // Images' files the drawing no longer has, e.g. ones deleted from it,
      // can't be brought back by undoing now, so they're removed.
      store
        .pruneImages?.(
          id,
          drawing.images.map((image) => image.id)
        )
        .catch(() => {});
    }
    setLoading(false);
    rulers.refresh();
    presence.refresh();
    update();
    onOpenCanvas?.(id);
  }

  function setLoading(value: boolean) {
    loading = value;
    root.toggleAttribute("data-loading", value);
  }

  // Removes a canvas from the history and the store.
  function deleteCanvas(id: string) {
    canvases = canvases.filter((canvas) => canvas.id !== id);
    deleted.add(id);
    unsaved.delete(id);
    for (const [imageId, kept] of imageFiles) {
      if (kept.canvasId === id) {
        imageFiles.delete(imageId);
      }
    }
    if (id === open.id) {
      openSaved = false;
      stored = null;
    }
    // In turn with saving, so a save already on its way doesn't add it back.
    saving = saving.then(() => store.deleteCanvas?.(id)).catch(() => {});
  }

  // Inserts images one after another, from `at` or the middle of what the
  // canvas shows, each a little further down and right. The select tool is
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
    if (last !== null && shortcutTools.includes("select")) {
      activeTool = "select";
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
    // It's kept as soon as it's asked, so the canvas can show it while it's
    // saved.
    void saveImageFile(open.id, id, file);
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
    // Everyone drawing together gets its file before the image, so it shows
    // as soon as the image does.
    const data = session?.history && (await blobToDataUrl(file));
    if (data) {
      session?.connection.send({ type: "image", image: { id, data } });
    }
    history.addItem("images", {
      id,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    });
    update();
    return id;
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
    // Picking another tool, or sizing or zooming, changes how the pointer
    // looks to everyone else.
    const { tool, size } = getPointerTool();
    if (pointer && (tool !== sharedTool.tool || size !== sharedTool.size)) {
      sharePointer();
    }
  }

  // The note and text tools draw nothing, so the canvas keeps the pencil's
  // settings while they're active. The highlighter's strokes are see-through,
  // with square ends, like a highlighter's tip, and the bucket fills in its
  // own color.
  function getStrokeToolState(): ToolState {
    if (activeTool === "bucket") {
      return { ...tools.pencil, color: bucketColor };
    }
    if (activeTool === "highlighter") {
      return {
        ...tools.highlighter,
        opacity: HIGHLIGHTER.opacity,
        cap: "square",
      };
    }
    return tools[isStrokeTool(activeTool) ? activeTool : "pencil"];
  }

  // The background new canvases start with, from the page's CSS, so a dark
  // theme can start them dark.
  function getDefaultBackground(): string {
    const value = getCssVariable(root, "--canvas-color-canvas");
    const channels = value ? parseColor(value) : null;
    return channels ? toHex(channels) : DEFAULT_BACKGROUND;
  }

  // Changes the canvas's background, so it can be undone.
  function setBackground(color: string) {
    if (loading) {
      return;
    }
    if (color !== history.drawing.background) {
      history.setBackground(color);
      fitPencilToBackground();
    }
    update();
  }

  // Joins `room`, opening its canvas, which the room starts from if it's
  // new. Leaves any room it's in first.
  function joinRoom(
    connection: CollaborationConnection,
    room: string,
    onLeave?: () => void
  ) {
    leaveRoom();
    // The room starts from this canvas's drawing if it's new, so it's joined
    // once that's loaded.
    const ready = openingId === room ? opening : openCanvas(room);
    const joined = {
      room,
      connection,
      history: null,
      me: null,
      activity: createActivitySender((activity) =>
        connection.send({ type: "activity", activity })
      ),
      peerActivities: new Map(),
      onLeave,
      stopListening: connection.listen((message) => {
        // Messages still on their way once it's left are ignored.
        if (session === joined) {
          receive(message);
        }
      }),
    };
    session = joined;
    void ready.then(() => {
      if (session !== joined) {
        return;
      }
      // It couldn't be opened, so there's nothing to join with.
      if (loading) {
        leaveRoom();
        return;
      }
      connection.send({
        type: "join",
        room,
        ...author,
        avatar,
        drawing: history.drawing,
      });
    });
    return () => {
      if (session === joined) {
        leaveRoom();
      }
    };
  }

  // Goes back to drawing alone, keeping the drawing as it is, with nothing
  // to undo, since what was undone was shared.
  function leaveRoom() {
    const left = session;
    if (!left) {
      return;
    }
    session = null;
    clearTimeout(pointerTimer);
    pointerTimer = undefined;
    clearTimeout(viewTimer);
    viewTimer = undefined;
    left.stopListening();
    left.activity.cancel();
    for (const id of left.peerActivities.keys()) {
      canvas.setPeerActivity({ id, color: "" }, null);
    }
    left.connection.send({ type: "leave" });
    presence.setPeers([]);
    placeTopRightToolbar();
    history = new DrawingHistory(history.drawing);
    update();
    left.onLeave?.();
  }

  // The top right toolbar is only in the page while it has controls, or
  // someone else is here to show at its start.
  function placeTopRightToolbar() {
    const { element } = topRightToolbar;
    const shown =
      topRightControls.some((group) => group.length > 0) ||
      !presence.element.hidden;
    if (shown && !element.isConnected) {
      corner.append(element);
    } else if (!shown && element.isConnected) {
      topRightToolbar.close();
      element.remove();
    }
  }

  function receive(message: CanvasServerMessage) {
    receiveMessage(message);
    placeTopRightToolbar();
  }

  function receiveMessage(message: CanvasServerMessage) {
    const shared = session!;
    switch (message.type) {
      case "welcome": {
        // Their files first, so the images show with the drawing.
        for (const image of message.images) {
          receiveImage(image);
        }
        const sent = new Set(message.images.map(({ id }) => id));
        shared.history = new SharedHistory(
          upgradeDrawing(message.drawing),
          message.edits,
          message.you,
          (edit) => shared.connection.send({ type: "edit", edit })
        );
        history = shared.history;
        shared.me = message.you;
        presence.setPeers(message.peers, {
          id: message.you,
          ...author,
          avatar,
          color: message.color,
        });
        receiveTimer(message.timer, false);
        fitPencilToBackground();
        update();
        void shareImages(
          history.drawing.images.filter(({ id }) => !sent.has(id))
        );
        sharePointer();
        shareView();
        return;
      }
      case "edit":
        shared.history?.receive(message.edit);
        update();
        return;
      case "image":
        receiveImage(message.image);
        return;
      case "presence":
        presence.setPeer(message.peer);
        return;
      case "pointer":
        presence.setPointer(message.id, message.pointer);
        return;
      case "activity":
        receiveActivityOf(shared, message.id, message.activity);
        return;
      case "view":
        presence.setView(message.id, message.view);
        if (presence.following === message.id) {
          showView(message.view);
        }
        return;
      // Starting to follow someone, e.g. as they have everyone follow them,
      // shows what they see straight away.
      case "follow": {
        presence.setFollowing(message.id, message.following);
        const view =
          message.id === shared.me && message.following
            ? presence.getPeer(message.following)?.view
            : null;
        if (view) {
          showView(view);
        }
        return;
      }
      case "timer":
        receiveTimer(message.timer, true);
        return;
      case "left":
        presence.removePeer(message.id);
        receiveActivityOf(shared, message.id, null);
        return;
    }
  }

  // Shows what someone else is in the middle of, in their color. Anything
  // that isn't an activity is ignored, since it could come from anyone.
  function receiveActivityOf(
    shared: NonNullable<typeof session>,
    id: string,
    activity: unknown
  ) {
    if (activity !== null && !isSharedActivity(activity)) {
      return;
    }
    const next = receiveActivity(
      shared.peerActivities.get(id) ?? null,
      activity
    );
    if (next) {
      shared.peerActivities.set(id, next);
    } else if (!shared.peerActivities.delete(id)) {
      return;
    }
    const color =
      presence.getPeer(id)?.color ??
      getCssVariable(root, "--canvas-color-accent");
    canvas.setPeerActivity({ id, color }, next);
  }

  // Keeps the file of an image someone else added, and shows it.
  function receiveImage({ id, data }: SharedImage) {
    const file = dataUrlToBlob(data);
    if (!file) {
      return;
    }
    void saveImageFile(open.id, id, file);
    canvas.reloadImage(id);
  }

  // Sends the files of images the room doesn't have yet, e.g. ones on the
  // canvas the room started from.
  async function shareImages(images: { id: string }[]) {
    const shared = session;
    for (const { id } of images) {
      const file = await loadImageFile(open.id, id);
      const data = file && (await blobToDataUrl(file));
      if (data && session === shared) {
        shared?.connection.send({ type: "image", image: { id, data } });
      }
    }
  }

  // Tells everyone drawing together where the pointer is, at most every so
  // often.
  function sharePointer() {
    if (!session?.history || pointerTimer !== undefined) {
      return;
    }
    pointerTimer = setTimeout(() => {
      pointerTimer = undefined;
      sharedTool = getPointerTool();
      session?.connection.send({
        type: "pointer",
        pointer: pointer && { ...pointer, ...sharedTool },
      });
    }, POINTER_SHARE_DELAY);
  }

  // The tool the pointer's pointing with, so it looks like it to everyone
  // else, and how far a stroke tool reaches, in drawing units, since that's
  // on screen here, whatever the zoom.
  function getPointerTool(): Pick<PeerPointer, "tool" | "size"> {
    return isStrokeTool(activeTool)
      ? {
          tool: activeTool,
          size: getStrokeToolState().size / canvas.viewport.zoom,
        }
      : { tool: activeTool };
  }

  // Tells everyone drawing together what the canvas shows, at most every so
  // often, so whoever follows it sees the same.
  function shareView() {
    if (!session?.history || viewTimer !== undefined) {
      return;
    }
    viewTimer = setTimeout(() => {
      viewTimer = undefined;
      session?.connection.send({ type: "view", view: canvas.visibleArea });
    }, POINTER_SHARE_DELAY);
  }

  // Follows someone, by their id, or stops following anyone with null.
  function follow(id: string | null) {
    session?.connection.send({ type: "follow", id });
  }

  // Shows what someone followed sees, and passes it on to anyone following
  // this canvas.
  function showView(view: PeerView) {
    canvas.showArea(view);
    rulers.refresh();
    presence.refresh();
    updateToolbars();
    shareView();
  }

  // The room's timer, as this canvas's, said when someone else starts one.
  function receiveTimer(shared: SharedTimer | null, announce: boolean) {
    if (!shared) {
      setTimer(null);
      return;
    }
    const by = shared.by === session?.me ? null : shared.by;
    const { duration, remaining } = shared;
    setTimer({
      endsAt: Date.now() + remaining,
      duration,
      sound: isTimerSound(shared.sound) ? shared.sound : "chime",
      by,
    });
    // Adding time to one already going isn't news.
    if (announce && by && duration === remaining) {
      const minutes = Math.round(duration / 60_000);
      toast.show(`${getPeerName(by)} started a ${minutes}-minute timer`);
    }
  }

  // Counts down while it's going, and goes off, playing its sound, once it's
  // done.
  function setTimer(next: Timer | null) {
    timer = next;
    clearInterval(timerTick);
    timerTick = undefined;
    if (next) {
      timerTick = setInterval(() => {
        if (timer && Date.now() >= timer.endsAt) {
          const { sound } = timer;
          setTimer(null);
          playTimerSound(sound);
          toast.show("Time's up");
        } else {
          updateToolbars();
        }
      }, TIMER_LAYOUT.tick);
    }
    updateToolbars();
  }

  function getPeerName(id: string): string {
    return presence.getPeerName(id) ?? "Someone";
  }

  // Tells everyone drawing together who this is, once it's changed.
  function shareProfile() {
    presence.setProfile(author, avatar);
    session?.connection.send({ type: "profile", ...author, avatar });
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

  // Whose color the color control and the dropper set: new notes', the
  // highlighter's, the bucket's, or the pencil's, which text uses too.
  function getColorTarget(): ColorTarget {
    const tool = activeTool === "dropper" ? previousTool : activeTool;
    return tool === "note" || tool === "highlighter" || tool === "bucket"
      ? tool
      : "pencil";
  }

  // A custom color that's the palette's, e.g. "red" typed, is kept as the
  // palette's, so it follows the palette, unless `matchPalette` is false.
  // Others are offered again.
  function keepColor(color: ToolColor, matchPalette = true): ToolColor {
    if (!isCustomColor(color)) {
      return color;
    }
    const palette =
      matchPalette &&
      COLORS.find(
        (option) =>
          toHex(parseColor(resolveColor(root, option)) ?? []) === color
      );
    if (palette) {
      return palette;
    }
    recentColors = addRecentColor(recentColors, color);
    return color;
  }

  function useColor(picked: ToolColor) {
    const color = keepColor(picked);
    const target = getColorTarget();
    if (target === "note") {
      noteColor = color;
    } else if (target === "bucket") {
      bucketColor = color;
    } else {
      tools = { ...tools, [target]: { ...tools[target], color } };
    }
  }

  // A note whose text changed, or that was drawn or filled on, is signed by
  // whoever changed it too, after whoever signed it before, unless they
  // already have. Moving or resizing it, or changing its color, doesn't.
  function sign(note: Note): Note {
    const before = history.drawing.notes.find(({ id }) => id === note.id);
    if (
      !getFullName(author) ||
      !before ||
      note.authors?.some((name) => isSameName(name, author))
    ) {
      return note;
    }
    const edited =
      note.strokes !== before.strokes ||
      note.fills.length !== before.fills.length ||
      JSON.stringify(note.content) !== JSON.stringify(before.content);
    return edited
      ? { ...note, authors: [...(note.authors ?? []), author] }
      : note;
  }

  // Text is in the pencil's color.
  function getPlacing(): Placing | null {
    if (activeTool === "note") {
      return {
        kind: "notes",
        color: noteColor,
        author: getFullName(author) ? author : null,
      };
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
      previousTool,
      tools,
      bucketColor,
      noteColor,
      typingNoteColor,
      colorFormats,
      colorTarget: getColorTarget(),
      recentColors,
      textSize,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      canClear: history.canClear,
      // This one is blank, so a new canvas would be the same.
      canStartNew: openSaved,
      name: open.name,
      author: getFullName(author),
      drawingSize: canvas.drawingSize,
      exportOptions,
      canvases,
      openCanvasId: open.id,
      zoom: canvas.viewport.zoom,
      rulers: rulers.shown,
      timer: timer && {
        remaining: timer.endsAt - Date.now(),
        by: timer.by && getPeerName(timer.by),
      },
      timerDuration,
      timerSound,
    };
  }

  // Shows the drawing and the tool on the canvas.
  function showDrawing() {
    const { drawing } = history;
    for (const kind of ITEM_KINDS) {
      canvas.setItems(kind, drawing[kind]);
    }
    canvas.setLayers(
      drawing.strokes,
      drawing.order,
      drawing.fills,
      drawing.erasers
    );
    canvas.setBackground(drawing.background);
    canvas.setToolState(getStrokeToolState());
    canvas.setPlacing(getPlacing());
    canvas.setPicking(activeTool === "dropper");
    canvas.setMoving(activeTool === "select");
    canvas.setHand(activeTool === "hand");
    canvas.setFilling(activeTool === "bucket");
    canvas.setColorSettings(recentColors, colorFormats.text);
  }

  function update() {
    const { drawing } = history;
    showDrawing();
    // Any change to the drawing, including undoing one, or to the name puts
    // the canvas at the top of the history, adding it if it was blank.
    if (drawing !== lastDrawing || open.name !== lastName) {
      lastDrawing = drawing;
      lastName = open.name;
      openSaved = true;
      open = { ...open, updatedAt: Date.now() };
      canvases = [open, ...canvases.filter(({ id }) => id !== open.id)];
    }
    reportName();
    reportBackground();
    updateToolbars();
    save();
  }

  // Saves the open canvas, if it's changed, and the settings, and says if
  // any of it couldn't be. Nothing's saved while a canvas opens, since it
  // isn't what's shown.
  function save() {
    saveSettings();
    const { drawing } = history;
    const { viewport } = canvas;
    // A blank canvas has nothing to keep.
    if (
      openSaved &&
      !loading &&
      !(
        stored?.id === open.id &&
        stored.drawing === drawing &&
        stored.name === open.name &&
        stored.viewport === viewport
      )
    ) {
      stored = { ...open, drawing, viewport };
      unsaved.set(open.id, stored);
      if (!saveQueued) {
        saveQueued = true;
        saving = saving.then(saveCanvases);
      }
    }
    showSaved();
  }

  // Saves each canvas waiting to be, one at a time, so they're saved in the
  // order they changed.
  async function saveCanvases() {
    saveQueued = false;
    const waiting = [...unsaved.values()];
    unsaved.clear();
    for (const each of waiting) {
      try {
        await store.saveCanvas(each);
        if (each.id === open.id) {
          canvasSaved = true;
        }
      } catch {
        // Tried again with the next change.
        if (stored === each) {
          stored = null;
        }
        if (each.id === open.id) {
          canvasSaved = false;
        }
      }
      showSaved();
    }
  }

  // Gives the page the settings, if they've changed.
  function saveSettings() {
    const settings = {
      // The dropper is only picked for a moment, so the tool before it is
      // what's kept.
      activeTool: activeTool === "dropper" ? previousTool : activeTool,
      tools,
      bucketColor,
      noteColor,
      textSize,
      recentColors,
      colorFormats,
      rulers: rulers.shown,
      export: exportOptions,
    };
    const json = JSON.stringify(settings);
    if (json !== reportedSettings) {
      reportedSettings = json;
      onSettingsChange?.(settings);
    }
  }

  // Resolves once everything saved so far is, with whether it all was.
  async function whenSaved(): Promise<boolean> {
    await opening;
    clearTimeout(viewportTimer);
    save();
    let waited: Promise<void>;
    do {
      waited = saving;
      await Promise.all([waited, ...imageSaves]);
    } while (waited !== saving || imageSaves.size > 0);
    return canvasSaved && imagesSaved && opened;
  }

  function showSaved() {
    if (unmounted) {
      return;
    }
    const message = !opened
      ? "Couldn't open this canvas"
      : canvasSaved && imagesSaved
        ? ""
        : "Couldn't save changes";
    status.textContent = message;
    status.toggleAttribute("data-shown", message !== "");
  }

  // Observing the wrapper catches every size change, not just window resizes.
  const observer = new ResizeObserver(([entry]) => {
    const { height, width } = entry.contentRect;
    canvas.setSize(width, height);
    rulers.refresh();
    // Whoever's followed is still all shown, at its new size.
    const followed =
      presence.following && presence.getPeer(presence.following)?.view;
    if (followed) {
      canvas.showArea(followed);
      presence.refresh();
    }
    shareView();
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
      author = trimName(name);
      canvas.setPlacing(getPlacing());
      shareProfile();
    },
    setAvatar: (url) => {
      avatar = url;
      shareProfile();
    },
    setShowAuthors: (show) => canvas.setShowAuthors(show),
    get canvasId() {
      return open.id;
    },
    collaborate: (connection, { room, onLeave }) =>
      joinRoom(connection, room, onLeave),
    whenSaved,
    unmount: () => {
      leaveRoom();
      // A canvas still being opened isn't shown.
      openToken++;
      unmounted = true;
      clearInterval(timerTick);
      // A view changed just before isn't lost.
      clearTimeout(viewportTimer);
      save();
      observer.disconnect();
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
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
