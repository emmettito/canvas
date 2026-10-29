// The move tool moves and resizes what's placed. The pencil and eraser draw
// strokes, the bucket fills areas, the note and text tools place notes and
// text, and the dropper picks a color from the drawing.
export type Tool =
  | "move"
  | "eraser"
  | "pencil"
  | "bucket"
  | "note"
  | "text"
  | "dropper";

// The tools that draw strokes, each at its own size.
export type StrokeTool = "eraser" | "pencil";
