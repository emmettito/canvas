import { type SettingsPalette } from "@emmettito/canvas";
import { type Color } from "../models/color.model";
import { DEFAULT_NOTE_COLOR } from "./default-note-color.const";

// The demo's palette, by name: each is a CSS variable on `.canvas-root`, in
// `styles.css`. Tool settings keep the name, so a tool's color follows the
// variable.
export const COLORS = [
  "--canvas-color-black",
  "--canvas-color-gray",
  "--canvas-color-white",
  "--canvas-color-cyan",
  "--canvas-color-blue",
  "--canvas-color-purple",
  "--canvas-color-magenta",
  "--canvas-color-pink",
  "--canvas-color-red",
  "--canvas-color-orange",
  "--canvas-color-amber",
  "--canvas-color-gold",
  "--canvas-color-yellow",
  "--canvas-color-lime",
  "--canvas-color-green",
] as const;

// The highlighter's first color, like a highlighter pen.
export const DEFAULT_HIGHLIGHTER_COLOR: Color = "--canvas-color-yellow";

// The palette, for reading the tool settings saved with it.
export const SETTINGS_PALETTE: SettingsPalette = {
  colors: COLORS,
  highlighter: DEFAULT_HIGHLIGHTER_COLOR,
  note: DEFAULT_NOTE_COLOR,
};
