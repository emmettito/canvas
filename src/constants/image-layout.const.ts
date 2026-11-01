// How images are placed, in drawing units.
export const IMAGE_LAYOUT = {
  // The smallest side an image can be resized to.
  minSize: 16,
  // A new image is scaled down to fit this much of the canvas.
  fit: 0.8,
  // Each further image dropped at once is placed this much further down and
  // right, so they don't hide each other.
  offset: 24,
};
