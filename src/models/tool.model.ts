// The move tool moves and resizes what's placed. The pencil, highlighter and
// eraser draw strokes, the bucket fills areas, the note and text tools place
// notes and text, the shape tool draws shapes, and the dropper picks a color
// from the drawing.
export type Tool =
  | "move"
  | "eraser"
  | "pencil"
  | "highlighter"
  | "bucket"
  | "note"
  | "text"
  | "shape"
  | "dropper";

// The tools that draw strokes, each at its own size.
export type StrokeTool = "eraser" | "pencil" | "highlighter";
