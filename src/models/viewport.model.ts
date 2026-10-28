// Which part of the drawing the canvas shows, and how big.
export interface Viewport {
  // The drawing point at the canvas's top left corner, in drawing units.
  x: number;
  y: number;
  // Screen pixels per drawing unit, e.g. 2 at 200%.
  zoom: number;
}
