import { describe, expect, it } from "vitest";
import {
  fromPlainText,
  getListMarkers,
  isEmpty,
  isLinkAddress,
  isRichText,
  toLinkAddress,
} from "./rich-text";

describe("getListMarkers", () => {
  it("numbers a list's items, and starts again after anything else", () => {
    expect(
      getListMarkers([
        { list: "ordered", runs: [] },
        { list: "ordered", runs: [] },
        { runs: [] },
        { list: "ordered", runs: [] },
        { list: "bullet", runs: [] },
      ])
    ).toEqual(["1.", "2.", null, "1.", "•"]);
  });

  it("numbers nested items on their own, going on around them", () => {
    expect(
      getListMarkers([
        { list: "ordered", runs: [] },
        { list: "ordered", level: 1, runs: [] },
        { list: "ordered", level: 1, runs: [] },
        { list: "ordered", level: 2, runs: [] },
        { list: "ordered", runs: [] },
        { list: "ordered", level: 1, runs: [] },
        { list: "bullet", level: 1, runs: [] },
      ])
    ).toEqual(["1.", "a.", "b.", "i.", "2.", "a.", "◦"]);
  });
});

describe("links", () => {
  it("only links to web and email addresses", () => {
    expect(isLinkAddress("https://example.com")).toBe(true);
    expect(isLinkAddress("mailto:ada@example.com")).toBe(true);
    expect(isLinkAddress("javascript:alert(1)")).toBe(false);
    expect(isLinkAddress("example.com")).toBe(false);
  });

  it("reads what's typed as an address", () => {
    expect(toLinkAddress(" example.com ")).toBe("https://example.com");
    expect(toLinkAddress("ada@example.com")).toBe("mailto:ada@example.com");
    expect(toLinkAddress("http://example.com/a")).toBe("http://example.com/a");
    expect(toLinkAddress("localhost:3000")).toBe("https://localhost:3000");
    expect(toLinkAddress("example.com:8080/a")).toBe(
      "https://example.com:8080/a"
    );
    expect(toLinkAddress("mailto:ada@example.com")).toBe(
      "mailto:ada@example.com"
    );
    expect(toLinkAddress("javascript:alert(1)")).toBeNull();
    expect(toLinkAddress("")).toBeNull();
    expect(toLinkAddress("not a link")).toBeNull();
  });

  it("only reads saved links, lists and levels that can be", () => {
    expect(
      isRichText([
        {
          list: "ordered",
          level: 2,
          runs: [{ text: "Hi", link: "https://example.com" }],
        },
      ])
    ).toBe(true);
    expect(
      isRichText([{ runs: [{ text: "Hi", link: "javascript:alert(1)" }] }])
    ).toBe(false);
    expect(isRichText([{ list: "dashes", runs: [] }])).toBe(false);
    expect(isRichText([{ list: "bullet", level: 99, runs: [] }])).toBe(false);
  });
});

describe("isEmpty", () => {
  it("is only empty with nothing typed, not even a space", () => {
    expect(isEmpty([{ runs: [] }])).toBe(true);
    expect(isEmpty(fromPlainText(""))).toBe(true);
    expect(isEmpty(fromPlainText(" "))).toBe(false);
    expect(isEmpty(fromPlainText("\n"))).toBe(false);
    expect(isEmpty([{ list: "bullet", runs: [] }])).toBe(false);
  });
});
