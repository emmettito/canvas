import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Activity, type SharedActivity } from "../models/activity.model";
import { type Stroke } from "../models/stroke.model";
import {
  createActivitySender,
  isSharedActivity,
  receiveActivity,
} from "./shared-activity";

function drawing(stroke: Stroke): Activity {
  return { type: "stroke", note: null, stroke };
}

describe("createActivitySender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a stroke's points once each, at most every so often", () => {
    const sent: (SharedActivity | null)[] = [];
    const sender = createActivitySender((activity) => sent.push(activity), 50);
    const stroke: Stroke = {
      id: "s17",
      color: "#000000",
      points: [{ x: 0, y: 0 }],
      size: 2,
    };

    sender.set(drawing(stroke));
    stroke.points.push({ x: 1, y: 0 });
    sender.set(drawing(stroke));
    stroke.points.push({ x: 2, y: 0 });
    sender.set(drawing(stroke));
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(50);

    expect(sent).toEqual([
      {
        type: "stroke",
        note: null,
        color: "#000000",
        size: 2,
        from: 0,
        points: [{ x: 0, y: 0 }],
      },
      {
        type: "stroke",
        note: null,
        color: "#000000",
        size: 2,
        from: 1,
        points: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
  });

  it("says it's done after what it changed, and only once", () => {
    const sent: (SharedActivity | null)[] = [];
    const sender = createActivitySender((activity) => sent.push(activity), 50);
    const move: Activity = {
      type: "move",
      kind: "notes",
      id: "n",
      box: { x: 1, y: 2 },
    };

    sender.set(move);
    sender.set(null);
    sent.push("the change" as never);
    sender.set(null);
    vi.runAllTimers();

    expect(sent).toEqual([move, "the change", null]);
  });

  it("sends nothing once it's cancelled", () => {
    const sent: (SharedActivity | null)[] = [];
    const sender = createActivitySender((activity) => sent.push(activity), 50);
    const stroke: Stroke = { id: "s16", points: [{ x: 0, y: 0 }], size: 2 };

    sender.set(drawing(stroke));
    stroke.points.push({ x: 1, y: 0 });
    sender.set(drawing(stroke));
    sender.cancel();
    vi.runAllTimers();

    expect(sent).toHaveLength(1);
  });
});

describe("receiveActivity", () => {
  const start: SharedActivity = {
    type: "stroke",
    note: "n",
    size: 3,
    from: 0,
    points: [{ x: 0, y: 0 }],
  };

  it("joins a stroke's points to the ones before", () => {
    const first = receiveActivity(null, start);
    const next = receiveActivity(first, {
      ...start,
      from: 1,
      points: [{ x: 5, y: 5 }],
    });

    expect(next).toEqual({
      type: "stroke",
      note: "n",
      stroke: {
        id: "",
        size: 3,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      },
    });
  });

  it("leaves out points that don't follow on", () => {
    const first = receiveActivity(null, start);

    expect(receiveActivity(first, { ...start, from: 4 })).toBe(first);
    expect(receiveActivity(null, { ...start, from: 4 })).toBeNull();
  });
});

describe("isSharedActivity", () => {
  it("tells activities from anything else", () => {
    expect(
      isSharedActivity({
        ...{ type: "stroke", note: null, size: 1 },
        from: 0,
        points: [],
      })
    ).toBe(true);
    expect(
      isSharedActivity({
        type: "move",
        kind: "texts",
        id: "t",
        box: { x: 0, y: 0, width: null },
      })
    ).toBe(true);
    expect(
      isSharedActivity({
        type: "stroke",
        note: null,
        size: 1,
        from: 0,
        points: [{ x: "0" }],
      })
    ).toBe(false);
    expect(
      isSharedActivity({
        type: "move",
        kind: "strokes",
        id: "t",
        box: { x: 0, y: 0 },
      })
    ).toBe(false);
    expect(
      isSharedActivity({ type: "typing", kind: "notes", item: { id: "n" } })
    ).toBe(false);
    expect(isSharedActivity(null)).toBe(false);
  });
});
