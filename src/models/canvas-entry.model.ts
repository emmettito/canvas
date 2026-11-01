// A saved canvas in the history, without its drawing.
export interface CanvasEntry {
  id: string;
  // Empty if the canvas was saved without a name.
  name: string;
  // When it was last saved, in milliseconds since 1970.
  updatedAt: number;
}
