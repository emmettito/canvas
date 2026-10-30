import { type CustomColor, type ToolColor } from "./color.model";
import { type ShapeType } from "./shape.model";
import { type ToolState } from "./tool-state.model";
import { type StrokeTool, type Tool } from "./tool.model";

// Shared by every canvas.
export interface ToolSettings {
  activeTool: Tool;
  tools: Record<StrokeTool, ToolState>;
  // The color new sticky notes are a light shade of.
  noteColor: ToolColor;
  // Custom colors picked, most recent first, to pick again.
  recentColors: CustomColor[];
  // The font size of new text, in drawing units. It's in the pencil's color.
  textSize: number;
  // The shape the shape tool draws, in the pencil's color and size.
  shapeType: ShapeType;
  // Whether the rulers along the canvas's edges are shown.
  rulers: boolean;
}
