// How far the canvas zooms.
export const ZOOM = {
  min: 0.1,
  max: 10,
  // Where zooming in and out steps to, from the toolbar or the keyboard.
  steps: [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10],
  // How much each pixel scrolled zooms, as a power of e, so zooming in and
  // back out by the same amount ends where it started.
  wheelSpeed: 0.01,
  // Room left around the drawing when zooming to fit it, as a share of the
  // canvas's size.
  fitMargin: 0.1,
};
