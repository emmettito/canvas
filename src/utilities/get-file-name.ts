import { UNTITLED_NAME } from "../constants/untitled-name.const";

// Characters that some systems don't allow in file names.
const UNSAFE_CHARACTERS = /[\\/:*?"<>|]/g;

/**
 * A file name for an export, from the canvas's name, e.g. "Sunset.png", or
 * "Untitled.png" for an untitled canvas, as it's called everywhere else.
 */
export function getFileName(name: string, extension: string): string {
  const safe = name.replace(UNSAFE_CHARACTERS, "-").trim();
  return `${safe || UNTITLED_NAME}.${extension}`;
}
