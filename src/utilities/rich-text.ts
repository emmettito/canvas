import { FONTS } from "../constants/fonts.const";
import {
  type FontName,
  type ListType,
  type Paragraph,
  type RichText,
  type TextAlign,
  type TextRun,
} from "../models/rich-text.model";

const ALIGNS: TextAlign[] = ["left", "center", "right"];
const LISTS: ListType[] = ["bullet", "ordered"];

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

/**
 * Whether there's nothing typed at all: one empty line that isn't a list's
 * item. Unlike `isBlank`, a space counts.
 */
export function isEmpty(content: RichText): boolean {
  return (
    content.length <= 1 &&
    !content[0]?.list &&
    (content[0]?.runs ?? []).every(({ text }) => text === "")
  );
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
    (value.link === undefined ||
      (typeof value.link === "string" && isLinkAddress(value.link))) &&
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
    (value.list === undefined || LISTS.includes(value.list as ListType)) &&
    (value.level === undefined ||
      (Number.isInteger(value.level) &&
        (value.level as number) >= 0 &&
        (value.level as number) <= MAX_LIST_LEVEL)) &&
    Array.isArray(value.runs) &&
    value.runs.every(isRun)
  );
}

/** Whether saved data is rich text, since it may be from another version. */
export function isRichText(value: unknown): value is RichText {
  return Array.isArray(value) && value.length > 0 && value.every(isParagraph);
}

// How far list items can be nested.
export const MAX_LIST_LEVEL = 5;

const BULLETS = ["•", "◦", "▪"];

// A number as a letter, e.g. 1 as "a" and 27 as "aa".
function toLetters(value: number): string {
  let letters = "";
  for (let rest = value; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(97 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function toRoman(value: number): string {
  const numerals: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let roman = "";
  let rest = value;
  for (const [amount, numeral] of numerals) {
    for (; rest >= amount; rest -= amount) {
      roman += numeral;
    }
  }
  return roman;
}

/**
 * What each paragraph's list item starts with, e.g. "•" or "2.", or null for
 * a paragraph that isn't one. Bullets change, and numbers go from numerals
 * to letters to roman numerals, the further in an item's nested. Numbering
 * goes on through the items nested in between, and starts again after
 * anything else.
 */
export function getListMarkers(content: RichText): (string | null)[] {
  const counts: number[] = [];
  const lists: ListType[] = [];
  return content.map(({ list, level = 0 }) => {
    if (!list) {
      counts.length = 0;
      lists.length = 0;
      return null;
    }
    counts.length = Math.min(counts.length, level + 1);
    lists.length = Math.min(lists.length, level + 1);
    const count = lists[level] === list ? (counts[level] ?? 0) + 1 : 1;
    counts[level] = count;
    lists[level] = list;
    if (list === "bullet") {
      return BULLETS[level % BULLETS.length];
    }
    const kind = level % 3;
    return `${kind === 0 ? count : kind === 1 ? toLetters(count) : toRoman(count)}.`;
  });
}

/** Whether `href` is an address a link can go to: http, https or mailto. */
export function isLinkAddress(href: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * What's typed as a link's address, as one, e.g. "example.com" as
 * "https://example.com". Null if it can't be one.
 */
export function toLinkAddress(text: string): string | null {
  const value = text.trim();
  // An address has no spaces, though some browsers would take one.
  if (!value || /\s/.test(value)) {
    return null;
  }
  // Only "//" or "mailto:" says there's a scheme already, since
  // "localhost:3000" starts like one.
  const href = /^([a-z][a-z\d+.-]*:\/\/|mailto:)/i.test(value)
    ? value
    : value.includes("@") && !value.includes("/")
      ? `mailto:${value}`
      : `https://${value}`;
  return isLinkAddress(href) ? href : null;
}
