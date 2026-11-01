import { describe, expect, it } from "vitest";
import {
  layOutRichText,
  type TextDefaults,
  type TextMeasurer,
  toCssFont,
} from "./lay-out-rich-text";
import { fromPlainText } from "./rich-text";

const DEFAULTS: TextDefaults = {
  fontSize: 10,
  fontFamily: "sans-serif",
  color: "#000000",
  lineHeight: 1.2,
};

// Each character is half the font size wide, and fonts reach 0.8 of their
// size above the baseline and 0.2 below. At size 10, with a line height of
// 1.2, a line is 12 tall with its baseline 9 down.
const MEASURER: TextMeasurer = {
  width: (text, { size }) => text.length * size * 0.5,
  metrics: ({ size }) => ({ ascent: size * 0.8, descent: size * 0.2 }),
};

function lay(
  content = fromPlainText("one two three"),
  width: number | null = null
) {
  return layOutRichText(content, width, DEFAULTS, MEASURER);
}

function lineTexts(
  content = fromPlainText("one two three"),
  width: number | null = null
) {
  return lay(content, width).lines.map(({ spans }) =>
    spans.map(({ text }) => text).join("")
  );
}

describe("layOutRichText", () => {
  it("is as wide as its longest line without a width", () => {
    const text = lay(fromPlainText("one\nthree"));

    expect(text.width).toBe(25);
    expect(text.height).toBe(24);
    expect(lineTexts(fromPlainText("one\nthree"))).toEqual(["one", "three"]);
  });

  it("wraps at spaces, keeping them at the end of the line", () => {
    // "one two " is 8 characters, 40 wide, and "three" doesn't fit after it.
    expect(lineTexts(undefined, 40)).toEqual(["one two ", "three"]);
  });

  it("breaks a word too long for a line", () => {
    expect(lineTexts(fromPlainText("abcdefgh"), 15)).toEqual([
      "abc",
      "def",
      "gh",
    ]);
  });

  it("places each line's baseline from its tallest text", () => {
    const text = lay([
      { runs: [{ text: "a" }, { text: "B", size: 20 }] },
      { runs: [{ text: "c" }] },
    ]);

    // Size 20 reaches (24 + 16 - 4) / 2 = 18 above the baseline, and
    // (24 - 16 + 4) / 2 = 6 below.
    expect(text.lines[0]).toMatchObject({ top: 0, bottom: 24 });
    expect(text.lines[0].spans.map(({ baseline }) => baseline)).toEqual([
      18, 18,
    ]);
    expect(text.lines[1]).toMatchObject({ top: 24, bottom: 36 });
    expect(text.lines[1].spans[0].baseline).toBe(33);
  });

  it("gives an empty line the text's own height", () => {
    const text = lay(fromPlainText("a\n\nb"));

    expect(text.lines.map(({ top }) => top)).toEqual([0, 12, 24]);
  });

  it("keeps a run's formatting, and joins text that looks the same", () => {
    const [line] = lay([
      {
        runs: [
          { text: "plain " },
          { text: "bold", bold: true, color: "#ff0000" },
          { text: " end" },
        ],
      },
    ]).lines;

    expect(line.spans.map(({ text, x }) => [text, x])).toEqual([
      ["plain ", 0],
      ["bold", 30],
      [" end", 50],
    ]);
    expect(line.spans[1].style).toMatchObject({
      bold: true,
      color: "#ff0000",
      size: 10,
    });
  });

  it("aligns each paragraph within the text's width", () => {
    const text = lay(
      [
        { align: "center", runs: [{ text: "ab" }] },
        { align: "right", runs: [{ text: "ab" }] },
        { runs: [{ text: "abcdef" }] },
      ],
      null
    );

    expect(text.lines.map(({ spans }) => spans[0].x)).toEqual([10, 20, 0]);
  });

  it("uses a font's family, or the default", () => {
    const [line] = lay([
      { runs: [{ text: "a", font: "mono" }, { text: "b" }] },
    ]).lines;

    expect(line.spans[0].style.family).toContain("monospace");
    expect(line.spans[1].style.family).toBe("sans-serif");
  });
});

describe("lists and links", () => {
  it("indents a list item, with its marker before its first line", () => {
    // A level is 1.5 times the font size in: 15.
    const { lines, width } = lay([
      { list: "bullet", runs: [{ text: "one two" }] },
      { list: "ordered", level: 1, runs: [{ text: "three" }] },
    ]);

    expect(lines[0].spans.map(({ text, x }) => [text, x])).toEqual([
      ["•", 0],
      ["one two", 15],
    ]);
    expect(lines[1].spans.map(({ text, x }) => [text, x])).toEqual([
      ["a.", 15],
      ["three", 30],
    ]);
    expect(width).toBe(55);
  });

  it("wraps a list item inside its indent, without another marker", () => {
    const { lines } = lay(
      [{ list: "bullet", runs: [{ text: "one two" }] }],
      40
    );

    expect(lines.map(({ spans }) => spans.map(({ text }) => text))).toEqual([
      ["•", "one "],
      ["two"],
    ]);
    expect(lines[1].spans[0].x).toBe(15);
  });

  it("keeps a link apart from the text around it", () => {
    const { lines } = lay([
      { runs: [{ text: "see " }, { text: "here", link: "https://a.example" }] },
    ]);

    expect(lines[0].spans.map(({ text, style }) => [text, style.link])).toEqual(
      [
        ["see ", null],
        ["here", "https://a.example"],
      ]
    );
  });
});

describe("toCssFont", () => {
  it("lists the style, weight, size and family", () => {
    expect(
      toCssFont({
        size: 16,
        family: "serif",
        bold: true,
        italic: true,
        underline: false,
        strike: false,
        link: null,
        color: "#000",
      })
    ).toBe("italic bold 16px serif");
  });
});
