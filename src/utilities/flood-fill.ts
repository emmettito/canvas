import { type Point } from "../models/point.model";

/** Which pixels of an image are in an area: 1 if they are, 0 if not. */
export interface Mask {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * The pixels connected to `seed`, side by side, whose color is within
 * `tolerance` of its color in every channel. `data` is RGBA, as an image's
 * data is.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seed: Point,
  tolerance: number
): Mask {
  const pixels = new Uint8Array(width * height);
  const start = seed.y * width + seed.x;
  const color = data.slice(start * 4, start * 4 + 4);
  const matches = (index: number) => {
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel++) {
      if (Math.abs(data[offset + channel] - color[channel]) > tolerance) {
        return false;
      }
    }
    return true;
  };
  // Each row is filled from the seed out to both sides, and the rows above
  // and below are searched from there.
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (pixels[index] || !matches(index)) {
      continue;
    }
    const y = Math.floor(index / width);
    const row = y * width;
    let left = index;
    while (left > row && !pixels[left - 1] && matches(left - 1)) {
      left--;
    }
    let right = index;
    while (
      right < row + width - 1 &&
      !pixels[right + 1] &&
      matches(right + 1)
    ) {
      right++;
    }
    for (let pixel = left; pixel <= right; pixel++) {
      pixels[pixel] = 1;
      if (y > 0 && !pixels[pixel - width]) {
        stack.push(pixel - width);
      }
      if (y < height - 1 && !pixels[pixel + width]) {
        stack.push(pixel + width);
      }
    }
  }
  return { pixels, width, height };
}

/** Whether any of the area is on the image's edge. */
export function touchesEdge({ pixels, width, height }: Mask): boolean {
  for (let x = 0; x < width; x++) {
    if (pixels[x] || pixels[(height - 1) * width + x]) {
      return true;
    }
  }
  for (let y = 0; y < height; y++) {
    if (pixels[y * width] || pixels[y * width + width - 1]) {
      return true;
    }
  }
  return false;
}

/**
 * The area grown by `radius` pixels in every direction, e.g. under the soft
 * edge of the lines around it, within the image.
 */
export function growMask(mask: Mask, radius: number): Mask {
  const { width, height } = mask;
  let pixels = mask.pixels;
  // A step to the sides, then up and down, `radius` times, which grows it
  // into an octagon, near enough a circle.
  for (let step = 0; step < radius; step++) {
    const grown = pixels.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (pixels[index]) {
          continue;
        }
        const diagonal = step % 2 === 1;
        if (
          (x > 0 && pixels[index - 1]) ||
          (x < width - 1 && pixels[index + 1]) ||
          (y > 0 && pixels[index - width]) ||
          (y < height - 1 && pixels[index + width]) ||
          (diagonal &&
            ((x > 0 && y > 0 && pixels[index - width - 1]) ||
              (x < width - 1 && y > 0 && pixels[index - width + 1]) ||
              (x > 0 && y < height - 1 && pixels[index + width - 1]) ||
              (x < width - 1 && y < height - 1 && pixels[index + width + 1])))
        ) {
          grown[index] = 1;
        }
      }
    }
    pixels = grown;
  }
  return { pixels, width, height };
}

/**
 * The outlines around the area, along its pixels' edges, as closed rings of
 * corners, from the image's top left corner. Holes have their own rings, so
 * it's filled every other time an outline is crossed.
 */
export function traceMask({ pixels, width, height }: Mask): Point[][] {
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x] === 1;
  // Each edge between a pixel in the area and one out of it, from corner to
  // corner, going around the area clockwise. Corners are numbered row by
  // row.
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const addEdge = (fromX: number, fromY: number, toX: number, toY: number) => {
    const from = fromY * stride + fromX;
    const to = toY * stride + toX;
    const next = edges.get(from);
    if (next) {
      next.push(to);
    } else {
      edges.set(from, [to]);
    }
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) {
        continue;
      }
      if (!filled(x, y - 1)) {
        addEdge(x, y, x + 1, y);
      }
      if (!filled(x + 1, y)) {
        addEdge(x + 1, y, x + 1, y + 1);
      }
      if (!filled(x, y + 1)) {
        addEdge(x + 1, y + 1, x, y + 1);
      }
      if (!filled(x - 1, y)) {
        addEdge(x, y + 1, x, y);
      }
    }
  }
  // Every corner has as many edges in as out, so following them from any
  // corner comes back to it.
  const rings: Point[][] = [];
  for (const start of edges.keys()) {
    while (edges.get(start)?.length) {
      const ring: Point[] = [];
      let corner = start;
      do {
        ring.push({ x: corner % stride, y: Math.floor(corner / stride) });
        const next = edges.get(corner)!;
        corner = next.pop()!;
      } while (corner !== start);
      rings.push(removeStraightCorners(ring));
    }
  }
  return rings;
}

// Corners along a straight edge, which don't change its shape.
function removeStraightCorners(ring: Point[]): Point[] {
  return ring.filter((point, index) => {
    const before = ring[(index - 1 + ring.length) % ring.length];
    const after = ring[(index + 1) % ring.length];
    return (
      (point.x - before.x) * (after.y - point.y) !==
      (point.y - before.y) * (after.x - point.x)
    );
  });
}

// How far `point` is from the line through `from` and `to`, or from `from`
// if they're the same point.
function getDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  return (
    Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) /
    length
  );
}

// The Ramer–Douglas–Peucker algorithm: the fewest of `points`, in order,
// that stay within `tolerance` of the line through them all.
function simplifyLine(points: Point[], tolerance: number): Point[] {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index++) {
      const away = getDistance(points[index], points[first], points[last]);
      if (away > distance) {
        farthest = index;
        distance = away;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/**
 * A closed ring with as few corners as stay within `tolerance` of it, which
 * turns the steps of pixels' edges into straight and slanted lines. A ring
 * too small to keep its shape is kept as it is.
 */
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) {
    return ring;
  }
  // Split at the corner farthest from the first, so neither half is empty.
  let far = 1;
  for (let index = 2; index < ring.length; index++) {
    if (
      getDistance(ring[index], ring[0], ring[0]) >
      getDistance(ring[far], ring[0], ring[0])
    ) {
      far = index;
    }
  }
  const simplified = [
    ...simplifyLine(ring.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplifyLine([...ring.slice(far), ring[0]], tolerance).slice(0, -1),
  ];
  return simplified.length >= 3 ? simplified : ring;
}
