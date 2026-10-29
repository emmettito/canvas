// The move tool moves and resizes what's placed. The pencil and eraser draw
// strokes, the note and text tools place notes and text, and the dropper
// picks a color from the drawing.
export type Tool = "move" | "eraser" | "pencil" | "note" | "text" | "dropper";

// The tools that draw strokes, each at its own size.
export type StrokeTool = "eraser" | "pencil";
