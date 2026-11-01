import { describe, expect, it } from "vitest";
import { getTicks, getTickSpacing } from "./ruler-ticks";

describe("ruler ticks", () => {
  it("spaces labeled ticks by round numbers at least the gap apart", () => {
    expect(getTickSpacing(1, 64)).toEqual({ step: 100, minor: 20 });
    expect(getTickSpacing(2, 64)).toEqual({ step: 50, minor: 10 });
    expect(getTickSpacing(4, 64)).toEqual({ step: 20, minor: 5 });
    expect(getTickSpacing(10, 64)).toEqual({ step: 10, minor: 2 });
    expect(getTickSpacing(0.1, 64)).toEqual({ step: 1000, minor: 200 });
    // Exactly the gap apart is far enough.
    expect(getTickSpacing(0.64, 64)).toEqual({ step: 100, minor: 20 });
  });

  it("lists the multiples of the step between two points", () => {
    expect(getTicks(-150, 120, 100)).toEqual([-100, 0, 100]);
    expect(getTicks(0, 200, 100)).toEqual([0, 100, 200]);
    expect(getTicks(10, 90, 100)).toEqual([]);
  });
});
