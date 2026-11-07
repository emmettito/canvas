// How the paint bucket finds and outlines an area.
export const FILL_LAYOUT = {
  // How far each channel of a pixel's color can be from the one pressed, out
  // of 255, and still be filled, so slightly different shades are.
  tolerance: 48,
  // How many pixels the area grows by, so it reaches under the soft edges of
  // the lines around it, which are drawn over it.
  grow: 2,
  // How far, in pixels, its outline can be from the pixels' edges, so steps
  // become straight lines.
  smoothing: 0.75,
  // How much more than what the canvas shows is searched on each side, as a
  // fraction of it, so an area a little past the edge is filled whole.
  margin: 0.5,
  // The most pixels searched, so a big canvas is searched at a lower
  // resolution rather than slowly.
  maxPixels: 4_000_000,
};
