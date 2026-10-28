import { FONTS } from "../constants/fonts.const";
import {
  type FontName,
  type Paragraph,
  type RichText,
  type TextAlign,
  type TextRun,
} from "../models/rich-text.model";

const ALIGNS: TextAlign[] = ["left", "center", "right"];

/** Plain text as rich text, a paragraph per line. */
export function fromPlainText(text: string): RichText {
  return text
    .split("\n")
    .map((line) => ({ runs: line === "" ? [] : [{ text: line }] }));
}

/** The text without its formatting, a line per paragraph. */
export function toPlainText(content: RichText): string {
  return content
    .map(({ runs }) => runs.map(({ text }) => text).join(""))
    .join("\n");
}

/** Whether there's no text, or only spaces and empty lines. */
export function isBlank(content: RichText): boolean {
  return toPlainText(content).trim() === "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptional(value: unknown, type: "boolean" | "string"): boolean {
  return value === undefined || typeof value === type;
}

function isRun(value: unknown): value is TextRun {
  return (
    isObject(value) &&
    typeof value.text === "string" &&
    isOptional(value.bold, "boolean") &&
    isOptional(value.italic, "boolean") &&
    isOptional(value.underline, "boolean") &&
    isOptional(value.strike, "boolean") &&
    isOptional(value.color, "string") &&
    (value.font === undefined ||
      Object.hasOwn(FONTS, value.font as FontName)) &&
    (value.size === undefined ||
      (typeof value.size === "number" &&
        Number.isFinite(value.size) &&
        value.size > 0))
  );
}

function isParagraph(value: unknown): value is Paragraph {
  return (
    isObject(value) &&
    (value.align === undefined || ALIGNS.includes(value.align as TextAlign)) &&
    Array.isArray(value.runs) &&
    value.runs.every(isRun)
  );
}

/** Whether saved data is rich text, since it may be from another version. */
export function isRichText(value: unknown): value is RichText {
  return Array.isArray(value) && value.length > 0 && value.every(isParagraph);
}
