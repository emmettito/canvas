// How the rulers along the canvas's edges are drawn, in pixels. How thick
// they are is up to the CSS.
export const RULER_LAYOUT = {
  // The least room between labeled ticks, so their labels don't run together.
  minGap: 64,
  // How long the labeled ticks and the ones between them are, from the edge
  // beside the canvas.
  majorTick: 6,
  minorTick: 3,
  fontSize: 10,
  // Room between a tick and its label.
  labelGap: 3,
  // Room on each side of the marked position's label, e.g. the pointer's,
  // where the labels under it are left out.
  markerPadding: 4,
};
