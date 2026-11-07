import { type ExportOptions } from "@emmettito/canvas";

// 2× matches most phone and laptop screens, so it looks sharp on them.
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "png",
  scale: 2,
  transparent: false,
};
