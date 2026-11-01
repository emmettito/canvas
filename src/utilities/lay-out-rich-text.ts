import { FONTS } from "../constants/fonts.const";
import { type RichText, type TextStyle } from "../models/rich-text.model";

// The text's own look, where its runs don't say otherwise.
export interface TextDefaults {
  fontSize: number;
  // The CSS font family of text without a font.
  fontFamily: string;
  color: string;
  // A multiple of each run's font size, as in CSS.
  lineHeight: number;
}

// A run's look, with nothing left out.
export interface ResolvedStyle {
  size: number;
  family: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
}

// How the text measures, in drawing units.
export interface TextMeasurer {
  width: (text: string, style: ResolvedStyle) => number;
  // How far the font reaches above and below its baseline.
  metrics: (style: ResolvedStyle) => { ascent: number; descent: number };
}

// Text that looks the same, placed on its line.
export interface PlacedSpan {
  text: string;
  style: ResolvedStyle;
  // From the text's left edge.
  x: number;
  width: number;
  // From the text's top, to the span's baseline.
  baseline: number;
}

export interface LaidOutText {
  // Top to bottom.
  lines: { top: number; bottom: number; spans: PlacedSpan[] }[];
  width: number;
  height: number;
}

/** The CSS `font` for a style, e.g. "italic bold 16px serif". */
export function toCssFont({
  size,
  family,
  bold,
  italic,
}: ResolvedStyle): string {
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`;
}

function resolve(style: TextStyle, defaults: TextDefaults): ResolvedStyle {
  return {
    size: style.size ?? defaults.fontSize,
    family: style.font ? FONTS[style.font].family : defaults.fontFamily,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    underline: style.underline ?? false,
    strike: style.strike ?? false,
    color: style.color ?? defaults.color,
  };
}

function isSameStyle(a: ResolvedStyle, b: ResolvedStyle): boolean {
  return (
    a.size === b.size &&
    a.family === b.family &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.color === b.color
  );
}

// A piece of a run: a word, or the spaces between words.
interface Piece {
  text: string;
  style: ResolvedStyle;
  width: number;
  isSpace: boolean;
}

// A word can span runs, e.g. "bold" with only "b" in bold, so it's kept
// together as the pieces it's made of.
type Token = { pieces: Piece[]; isSpace: boolean; width: number };

function toTokens(pieces: Piece[]): Token[] {
  const tokens: Token[] = [];
  for (const piece of pieces) {
    const last = tokens.at(-1);
    if (last && last.isSpace === piece.isSpace) {
      last.pieces.push(piece);
      last.width += piece.width;
    } else {
      tokens.push({
        pieces: [piece],
        isSpace: piece.isSpace,
        width: piece.width,
      });
    }
  }
  return tokens;
}

// A word too long for any line, broken wherever it has to be, with at least
// one character on each line.
function breakWord(
  word: Token,
  width: number,
  measurer: TextMeasurer
): Token[] {
  const parts: Token[] = [];
  let part: Token = { pieces: [], isSpace: false, width: 0 };
  for (const piece of word.pieces) {
    for (const character of piece.text) {
      const characterWidth = measurer.width(character, piece.style);
      if (part.width > 0 && part.width + characterWidth > width) {
        parts.push(part);
        part = { pieces: [], isSpace: false, width: 0 };
      }
      const last = part.pieces.at(-1);
      if (last && last.style === piece.style) {
        last.text += character;
        last.width += characterWidth;
      } else {
        part.pieces.push({
          text: character,
          style: piece.style,
          width: characterWidth,
          isSpace: false,
        });
      }
      part.width += characterWidth;
    }
  }
  parts.push(part);
  return parts;
}

// Splits a paragraph into lines `width` wide, or only at its end if it's
// null. Spaces at a break stay at the end of the line, as in CSS, but don't
// count towards its width.
function wrap(
  tokens: Token[],
  width: number | null,
  measurer: TextMeasurer
): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    const line = lines.at(-1)!;
    const hasWord = line.some(({ isSpace }) => !isSpace);
    if (
      token.isSpace ||
      width === null ||
      getWidth([...line, token]) <= width ||
      (!hasWord && token.width <= width)
    ) {
      line.push(token);
    } else if (token.width <= width) {
      lines.push([token]);
    } else {
      // Too long for any line, so it's broken, starting on this line if
      // there's no word on it yet.
      breakWord(token, width, measurer).forEach((part, index) => {
        if (index === 0 && !hasWord) {
          line.push(part);
        } else {
          lines.push([part]);
        }
      });
    }
  }
  return lines;
}

// How wide a line is, without the spaces at its end.
function getWidth(line: Token[]): number {
  let end = line.length;
  while (end > 0 && line[end - 1].isSpace) {
    end--;
  }
  return line.slice(0, end).reduce((total, token) => total + token.width, 0);
}

/**
 * Lays out rich text the way the canvas shows it, so it can be drawn again,
 * e.g. into an exported file. Text wraps at `width`, or is as wide as its
 * longest line if that's null. Each line is as tall as its tallest text, and
 * the text's own font size sets the least, as CSS's line boxes do.
 */
export function layOutRichText(
  content: RichText,
  width: number | null,
  defaults: TextDefaults,
  measurer: TextMeasurer
): LaidOutText {
  const strut = resolve({}, defaults);
  // How far a style's line box reaches above and below its baseline.
  const extent = (style: ResolvedStyle) => {
    const { ascent, descent } = measurer.metrics(style);
    const lineHeight = style.size * defaults.lineHeight;
    return {
      above: (lineHeight + ascent - descent) / 2,
      below: (lineHeight - ascent + descent) / 2,
    };
  };

  const paragraphs = content.map(({ align = "left", runs }) => {
    const pieces: Piece[] = runs.flatMap((run) => {
      const style = resolve(run, defaults);
      return run.text
        .split(/( +)/)
        .filter((text) => text !== "")
        .map((text) => ({
          text,
          style,
          width: measurer.width(text, style),
          isSpace: text.startsWith(" "),
        }));
    });
    return { align, lines: wrap(toTokens(pieces), width, measurer) };
  });
  const textWidth =
    width ??
    Math.max(
      0,
      ...paragraphs.flatMap(({ lines }) => lines.map((line) => getWidth(line)))
    );

  const lines: LaidOutText["lines"] = [];
  let top = 0;
  for (const { align, lines: tokenLines } of paragraphs) {
    for (const line of tokenLines) {
      const pieces = line.flatMap(({ pieces }) => pieces);
      let above = extent(strut).above;
      let below = extent(strut).below;
      for (const { style } of pieces) {
        above = Math.max(above, extent(style).above);
        below = Math.max(below, extent(style).below);
      }
      const baseline = top + above;
      const lineWidth = getWidth(line);
      let x =
        align === "center"
          ? (textWidth - lineWidth) / 2
          : align === "right"
            ? textWidth - lineWidth
            : 0;
      const spans: PlacedSpan[] = [];
      for (const piece of pieces) {
        const last = spans.at(-1);
        if (last && isSameStyle(last.style, piece.style)) {
          last.text += piece.text;
          last.width += piece.width;
        } else {
          spans.push({
            text: piece.text,
            style: piece.style,
            x,
            width: piece.width,
            baseline,
          });
        }
        x += piece.width;
      }
      lines.push({ top, bottom: baseline + below, spans });
      top = baseline + below;
    }
  }
  return { lines, width: textWidth, height: top };
}
