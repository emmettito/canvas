import { type Point } from "./point.model";

/**
 * An area filled with the paint bucket, as the outlines around it. Where
 * outlines overlap, e.g. a hole in it, it's filled every other time they're
 * crossed. Fills are below every stroke and item, so lines drawn around an
 * area stay over its edge.
 */
export interface Fill {
  // A resolved color value, like a stroke's.
  color: string;
  // Each closed outline, as its corners.
  rings: Point[][];
  // How many of the erasers kept were drawn before it, so the ones after them
  // erase it, and ones before them don't.
  after: number;
}
