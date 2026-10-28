// The pencil and eraser draw strokes. The note and text tools place notes and
// text, and the dropper picks a color from the drawing.
export type Tool = "eraser" | "pencil" | "note" | "text" | "dropper";

// The tools that draw strokes, each at its own size.
export type StrokeTool = Exclude<Tool, "note" | "text" | "dropper">;
