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
