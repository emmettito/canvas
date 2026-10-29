import { describe, expect, it } from "vitest";
import { formatTimer } from "./format-timer";

describe("formatTimer", () => {
  it("shows minutes and seconds", () => {
    expect(formatTimer(245_000)).toBe("4:05");
    expect(formatTimer(30 * 60_000)).toBe("30:00");
  });

  it("counts a part second as a whole one", () => {
    expect(formatTimer(59_001)).toBe("1:00");
    expect(formatTimer(1)).toBe("0:01");
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(-5)).toBe("0:00");
  });

  it("shows hours past an hour", () => {
    expect(formatTimer(3_723_000)).toBe("1:02:03");
  });
});
