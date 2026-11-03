import { ITEM_KINDS } from "../constants/item-kinds.const";
import { type Activity, type SharedActivity } from "../models/activity.model";
import { type ItemKind } from "../models/drawing.model";
import { type Point } from "../models/point.model";
import { type Stroke } from "../models/stroke.model";

// How often, at most, what's being done is sent, in milliseconds, so a
// stroke or a drag doesn't flood the room.
const ACTIVITY_DELAY = 50;

export interface ActivitySender {
  /** What's being done now, or null once it's done. */
  set(activity: Activity | null): void;
  /** Stops sending, e.g. once the room's left. */
  cancel(): void;
}

/**
 * Sends what's being done as it changes, at most every so often, and right
 * away when it starts. A stroke's points go once each. That it's done goes
 * after whatever change it made, which is sent as it's made, so everyone
 * else sees the change before what showed it goes.
 */
export function createActivitySender(
  send: (activity: SharedActivity | null) => void,
  delay = ACTIVITY_DELAY
): ActivitySender {
  let latest: Activity | null = null;
  // Set while waiting to send again, and whether there's anything to send.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let changed = false;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  // The stroke being sent, and how many of its points have been.
  let sentStroke: { stroke: Stroke; count: number } | null = null;
  // Whether everyone knows nothing's being done.
  let idle = true;

  function flush() {
    changed = false;
    if (!latest) {
      return;
    }
    if (latest.type !== "stroke") {
      sentStroke = null;
      send(latest);
      idle = false;
      return;
    }
    const { note, stroke } = latest;
    const from = sentStroke?.stroke === stroke ? sentStroke.count : 0;
    if (from > 0 && from === stroke.points.length) {
      return;
    }
    send({
      type: "stroke",
      note,
      ...(stroke.color !== undefined && { color: stroke.color }),
      size: stroke.size,
      ...(stroke.opacity !== undefined && { opacity: stroke.opacity }),
      ...(stroke.cap && { cap: stroke.cap }),
      from,
      points: stroke.points.slice(from),
    });
    sentStroke = { stroke, count: stroke.points.length };
    idle = false;
  }

  function cool() {
    timer = setTimeout(() => {
      timer = undefined;
      if (changed) {
        flush();
        cool();
      }
    }, delay);
  }

  return {
    set(activity) {
      latest = activity;
      if (!activity) {
        clearTimeout(timer);
        timer = undefined;
        changed = false;
        sentStroke = null;
        if (!idle) {
          clearTimeout(doneTimer);
          doneTimer = setTimeout(() => {
            if (!latest && !idle) {
              idle = true;
              send(null);
            }
          });
        }
        return;
      }
      if (timer === undefined) {
        flush();
        cool();
      } else {
        changed = true;
      }
    },
    cancel() {
      clearTimeout(timer);
      clearTimeout(doneTimer);
      timer = undefined;
      latest = null;
      sentStroke = null;
      idle = true;
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return isObject(value) && isNumber(value.x) && isNumber(value.y);
}

function isKind(value: unknown): value is ItemKind {
  return ITEM_KINDS.includes(value as ItemKind);
}

/**
 * Whether someone else's activity is one, since it comes from anyone in
 * the room, so a canvas can't be broken by one that isn't.
 */
export function isSharedActivity(value: unknown): value is SharedActivity {
  if (!isObject(value)) {
    return false;
  }
  switch (value.type) {
    case "stroke":
      return (
        (value.note === null || typeof value.note === "string") &&
        (value.color === undefined || typeof value.color === "string") &&
        isNumber(value.size) &&
        value.size > 0 &&
        (value.opacity === undefined ||
          (isNumber(value.opacity) &&
            value.opacity >= 0 &&
            value.opacity <= 1)) &&
        (value.cap === undefined || value.cap === "square") &&
        Number.isInteger(value.from) &&
        (value.from as number) >= 0 &&
        Array.isArray(value.points) &&
        value.points.every(isPoint)
      );
    case "move":
      return (
        isKind(value.kind) &&
        typeof value.id === "string" &&
        isObject(value.box) &&
        isNumber(value.box.x) &&
        isNumber(value.box.y) &&
        [value.box.width, value.box.height].every(
          (side) => side === undefined || side === null || isNumber(side)
        )
      );
    case "typing":
      return (
        (value.kind === "notes" || value.kind === "texts") &&
        isObject(value.item) &&
        typeof value.item.id === "string" &&
        isNumber(value.item.x) &&
        isNumber(value.item.y) &&
        Array.isArray(value.item.content)
      );
    default:
      return false;
  }
}

/**
 * Someone else's activity, as `before` with `shared` received: their
 * stroke's points joined to the ones before, or what they're doing now.
 * Points that don't follow on from the ones before, e.g. from a stroke
 * started before joining, are left out until the next stroke.
 */
export function receiveActivity(
  before: Activity | null,
  shared: SharedActivity | null
): Activity | null {
  if (shared?.type !== "stroke") {
    return shared;
  }
  const { note, color, size, opacity, cap, from, points } = shared;
  if (from === 0) {
    return {
      type: "stroke",
      note,
      stroke: {
        // Only drawn, until it's added.
        id: "",
        ...(color !== undefined && { color }),
        points,
        size,
        ...(opacity !== undefined && { opacity }),
        ...(cap && { cap }),
      },
    };
  }
  if (before?.type === "stroke" && before.stroke.points.length === from) {
    return {
      ...before,
      stroke: {
        ...before.stroke,
        points: [...before.stroke.points, ...points],
      },
    };
  }
  return before?.type === "stroke" ? before : null;
}
