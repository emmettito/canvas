// The demo's canvas: the UI the demo page builds from the library's
// utilities, with its toolbars and controls. The demo page and the test pages
// mount it from here, and import `styles.css` themselves: `sideEffects` in
// package.json lets the build skip this file, along with any import of it.

export {
  type CollaborateOptions,
  type MountCanvasOptions,
  type MountedCanvas,
  mountCanvas,
} from "./components/canvas-wrapper/canvas-wrapper";
export {
  type FileMenuItem,
  type ToolbarControl,
  type ZoomAction,
} from "./models/toolbar-control.model";
export {
  type Format,
  type TextEditor,
  type TextEditorFactory,
  type TextEditorOptions,
  type TextFormatting,
  type ToggleMark,
  type ValueMark,
} from "./models/text-editor.model";
// The toolbars' controls, and the file menu's items. Each is its own export,
// and nothing else refers to them, so a page's build leaves out the ones it
// doesn't use.
export { undoButton, redoButton } from "./controls/undo-buttons";
export { clearButton } from "./controls/clear-button";
export { newCanvasButton, newCanvasItem } from "./controls/new-canvas";
export { historyButton, historyItem } from "./controls/history";
export { renameItem } from "./controls/rename";
export { exportButton, exportItem } from "./controls/export";
export {
  selectTool,
  handTool,
  pencilTool,
  highlighterTool,
  eraserTool,
  bucketTool,
  noteTool,
  textTool,
  dropperTool,
} from "./controls/tools";
export { imageButton } from "./controls/image-button";
export { colorControl } from "./controls/color-control";
export { zoomControl } from "./controls/zoom-control";
export { timerControl } from "./controls/timer-control";
export { fileMenu } from "./controls/file-menu";
export { customButton } from "./controls/custom-button";
