import { type TextStyle } from "../utilities/export-drawing";
import { type Box } from "./box.model";
import { type Drawing } from "./drawing.model";

// The file types the canvas exports to.
export type ExportFormat = "png" | "jpeg" | "svg";

// Pixels per drawing unit in the exported image.
export type ExportScale = 1 | 2 | 4;

export interface ExportOptions {
  format: ExportFormat;
  scale: ExportScale;
  // Leaves out the canvas color. JPEG has no transparency, so it ignores this.
  transparent: boolean;
}

/**
 * What a file of the drawing is made from: what's drawn, the part of it
 * that's shown, the canvas color, how its text looks, and its images' files,
 * by id.
 */
export interface ExportSource {
  drawing: Drawing;
  area: Box;
  background: string;
  textStyle: TextStyle;
  files: Map<string, Blob>;
}
