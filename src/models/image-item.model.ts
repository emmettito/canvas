// An image on the drawing, in drawing units. Its file is kept apart, under
// the same id, since it's too big for local storage.
export interface ImageItem {
  id: string;
  // The top left corner.
  x: number;
  y: number;
  width: number;
  height: number;
}
