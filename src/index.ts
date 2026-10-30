// The variables and reset shared by every component.
import "./styles.css";

export {
  type CollaborateOptions,
  type MountCanvasOptions,
  type MountedCanvas,
  mountCanvas,
} from "./components/canvas-wrapper/canvas-wrapper";
export {
  type CanvasClientMessage,
  type CanvasServerMessage,
  type CollaborationConnection,
} from "./models/collaboration.model";
export { type PersonName } from "./models/person-name.model";
export {
  type FileMenuItem,
  type ToolbarAction,
  type ToolbarControl,
  type ZoomAction,
} from "./models/toolbar-control.model";
export {
  type FontName,
  type Paragraph,
  type RichText,
  type TextAlign,
  type TextRun,
  type TextStyle,
} from "./models/rich-text.model";
export {
  type Format,
  type TextEditor,
  type TextEditorFactory,
  type TextEditorOptions,
  type TextFormatting,
  type ToggleMark,
  type ValueMark,
} from "./models/text-editor.model";
