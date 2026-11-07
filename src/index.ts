// `@emmettito/canvas`: utilities for a drawing canvas. There's no UI here, no
// elements, layout or styles: the page builds its own, and uses these for the
// drawing's data, how it's drawn and exported, its history, and drawing
// together. The demo page in `demo/` is one such UI.

// The drawing's data, and what's saved and sent of it.
// What the collaboration server sends and keeps of each person drawing. The
// server itself is `@emmettito/canvas/collaboration-server`, so pages don't
// load it.
export {
  type Peer,
  type PeerPointer,
  type PeerView,
  type SharedImage,
  type SharedTimer,
} from "./collaboration-server";
export { type Activity, type SharedActivity } from "./models/activity.model";
export { type Box } from "./models/box.model";
export { type CanvasEntry } from "./models/canvas-entry.model";
export {
  type SavedCanvas,
  type CanvasStore,
} from "./models/canvas-store.model";
export {
  type DrawingEdit,
  type CanvasClientMessage,
  type CanvasServerMessage,
  type CollaborationConnection,
} from "./models/collaboration.model";
export {
  type CustomColor,
  type PaletteColor,
  type ToolColor,
} from "./models/color.model";
export { type DrawingChange } from "./models/drawing-change.model";
export {
  type Drawing,
  type ItemKind,
  type DrawingItem,
} from "./models/drawing.model";
export {
  type ExportFormat,
  type ExportScale,
  type ExportOptions,
  type ExportSource,
} from "./models/export-options.model";
export { type Fill } from "./models/fill.model";
export { type History } from "./models/history.model";
export { type ImageItem } from "./models/image-item.model";
export { type Layer, type StrokeLayer } from "./models/layer.model";
export { type Note } from "./models/note.model";
export { type PersonName } from "./models/person-name.model";
export { type Point } from "./models/point.model";
export { type ResizeHandle } from "./models/resize-handle.model";
export {
  type FontName,
  type TextAlign,
  type ListType,
  type TextStyle,
  type TextRun,
  type Paragraph,
  type RichText,
} from "./models/rich-text.model";
export { type Size } from "./models/size.model";
export { type StrokePoint, type Stroke } from "./models/stroke.model";
export { type TextBox } from "./models/text-box.model";
export { type ToolSettings } from "./models/tool-settings.model";
export { type ToolState } from "./models/tool-state.model";
export { type Tool, type StrokeTool } from "./models/tool.model";
export { type Viewport } from "./models/viewport.model";

// The limits and defaults of what's drawn and saved.
export { DEFAULT_TOOL_SIZES } from "./constants/default-tool-sizes.const";
export { EXPORT_FORMATS } from "./constants/export-formats.const";
export { EXPORT_SCALES } from "./constants/export-scales.const";
export { FONTS } from "./constants/fonts.const";
export { HIGHLIGHTER } from "./constants/highlighter.const";
export { ITEM_KINDS } from "./constants/item-kinds.const";
export { MAX_EXPORT_PIXELS } from "./constants/max-export-pixels.const";
export { MAX_TOOL_SIZE } from "./constants/max-tool-size.const";
export { MIN_TOOL_SIZE } from "./constants/min-tool-size.const";
export { NOTE_LAYOUT } from "./constants/note-layout.const";
export { PEN_PRESSURE } from "./constants/pen-pressure.const";
export { MAX_RECENT_COLORS } from "./constants/recent-colors.const";
export { TEXT_LAYOUT } from "./constants/text-layout.const";
export { TOOLS } from "./constants/tools.const";
export { UNTITLED_NAME } from "./constants/untitled-name.const";
export { ZOOM } from "./constants/zoom.const";

// What works with the data: drawing it, changing it, undoing, saving,
// exporting, and drawing together.
export { hasContent, applyChange } from "./utilities/apply-change";
export {
  type ColorFormat,
  COLOR_FORMATS,
  isColorFormat,
  type ColorFormatTarget,
  type ColorFormats,
  DEFAULT_COLOR_FORMATS,
  formatColor,
  readColor,
  keepAlpha,
} from "./utilities/color-formats";
export { getColorGrid } from "./utilities/color-grid";
export {
  isCustomColor,
  splitAlpha,
  withAlpha,
  isToolColor,
  parseColor,
  readCssColor,
  readColorWithAlpha,
  toHex,
  isDarkColor,
  addRecentColor,
} from "./utilities/colors";
export { createId } from "./utilities/create-id";
export { blobToDataUrl, dataUrlToBlob } from "./utilities/data-url";
export { getFillPath, getFillSteps, drawFills } from "./utilities/draw-fills";
export { drawStroke } from "./utilities/draw-stroke";
export { DrawingHistory } from "./utilities/drawing-history";
export {
  getDistanceToLine,
  getDistanceToStroke,
  eraseStroke,
  eraseStrokes,
  touchesFill,
} from "./utilities/erase-strokes";
export {
  EXPORT_EXTENSIONS,
  type ExportTextStyle,
  getExportSize,
  canExportAt,
  exportDrawing,
  renderDrawing,
  createSvg,
} from "./utilities/export-drawing";
export {
  type Mask,
  floodFill,
  touchesEdge,
  growMask,
  traceMask,
  simplifyRing,
} from "./utilities/flood-fill";
export { getSignerNames, getByline } from "./utilities/get-byline";
export { getFileName } from "./utilities/get-file-name";
export { getImageSize } from "./utilities/get-image-size";
export {
  LIST_INDENT,
  type TextDefaults,
  type ResolvedStyle,
  type TextMeasurer,
  type PlacedSpan,
  type LaidOutText,
  toCssFont,
  layOutRichText,
} from "./utilities/lay-out-rich-text";
export {
  type ResolvedLayer,
  type Restack,
  isEraser,
  mergeRuns,
  getDefaultOrder,
  isOrderOf,
  addStrokeLayer,
  resizeStrokeLayers,
  addItemLayer,
  removeItemLayer,
  restackItemLayer,
  isAtEdge,
  resolveLayers,
  isStrokeAtEdge,
  restackStrokeLayer,
} from "./utilities/layers";
export { createMemoryStore } from "./utilities/memory-store";
export {
  getFullName,
  trimName,
  isSameName,
  splitName,
  getShortNames,
} from "./utilities/person-names";
export { crc32, createTextChunk, addPngText } from "./utilities/png-text";
export {
  isStroke,
  readItem,
  readToolSettings,
  readExportOptions,
  readEntries,
  type SavedParts,
  type SettingsPalette,
  readDrawing,
  readViewport,
} from "./utilities/read-saved";
export { resizeBox, resizeBoxKeepingShape } from "./utilities/resize-box";
export {
  fromPlainText,
  toPlainText,
  isEmpty,
  isBlank,
  isRichText,
  MAX_LIST_LEVEL,
  getListMarkers,
  isLinkAddress,
  toLinkAddress,
} from "./utilities/rich-text";
export {
  type ActivitySender,
  createActivitySender,
  isSharedActivity,
  receiveActivity,
} from "./utilities/shared-activity";
export { replayEdits, SharedHistory } from "./utilities/shared-history";
export { type SnapGuide, type Snapped, snapBox } from "./utilities/snap-box";
export {
  type StrokePiece,
  hasPressure,
  getStrokeReach,
  getPointReach,
  getDotSize,
  getStrokePieces,
  getSquareOutlines,
} from "./utilities/stroke-pieces";
export {
  isStrokeAt,
  isStrokeInBox,
  moveStroke,
  resizeStroke,
} from "./utilities/stroke-shape";
export {
  isOldInk,
  upgradeInk,
  upgradeDrawing,
} from "./utilities/upgrade-drawing";
export {
  DEFAULT_VIEWPORT,
  clampZoom,
  toDrawingPoint,
  zoomAround,
  panBy,
  stepZoom,
  getVisibleArea,
  unionBoxes,
  getStrokeBox,
  intersectBoxes,
  getFillBox,
  fitViewport,
  getOpaqueBox,
} from "./utilities/viewport";
