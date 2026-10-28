// The pencil and eraser draw strokes. The note and text tools place notes and
// text.
export type Tool = "eraser" | "pencil" | "note" | "text";

// The tools that draw strokes, each at its own size.
export type StrokeTool = Exclude<Tool, "note" | "text">;
