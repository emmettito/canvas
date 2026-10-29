import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollaborationServer,
  type ServerMessage,
} from "./collaboration-server";

function connect(server: CollaborationServer) {
  const received: ServerMessage[] = [];
  const connection = server.connect((message) => received.push(message));
  return { connection, received };
}

// Connections that have each joined room "r", in order.
function joinAll(server: CollaborationServer, count: number) {
  return Array.from({ length: count }, () => {
    const each = connect(server);
    each.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    return each;
  });
}

describe("CollaborationServer", () => {
  it("welcomes someone with the room so far, and who's there", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "Ada",
      avatar: "",
      drawing: 1,
    });
    a.connection.receive({
      type: "edit",
      edit: { id: "e", author: "", type: "change", change: "x" },
    });
    const b = connect(server);
    b.connection.receive({
      type: "join",
      room: "r",
      name: "Bo",
      avatar: "",
      drawing: 2,
    });

    expect(b.received).toEqual([
      {
        type: "welcome",
        you: "peer-2",
        drawing: 1,
        edits: [{ id: "e", author: "peer-1", type: "change", change: "x" }],
        images: [],
        peers: [
          {
            id: "peer-1",
            name: "Ada",
            avatar: "",
            color: expect.any(String),
            pointer: null,
            view: null,
            following: null,
          },
        ],
        timer: null,
      },
    ]);
    // Told who's joined, in another color.
    const joined = a.received.at(-1);
    expect(joined).toMatchObject({ type: "presence", peer: { name: "Bo" } });
    expect(joined).not.toMatchObject({
      peer: {
        color: (b.received[0] as { peers: { color: string }[] }).peers[0].color,
      },
    });
  });

  it("sends each edit to everyone, including whoever made it", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });

    const edit = { id: "e", author: "anyone", type: "undo", target: "t" };
    b.connection.receive({ type: "edit", edit });

    const sent = { type: "edit", edit: { ...edit, author: "peer-2" } };
    expect(a.received.at(-1)).toEqual(sent);
    expect(b.received.at(-1)).toEqual(sent);
  });

  it("passes on where someone's pointing, and images, to everyone else", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    const before = b.received.length;

    b.connection.receive({ type: "pointer", pointer: { x: 1, y: 2 } });
    const image = { id: "i", data: "data:image/png;base64,AA==" };
    b.connection.receive({ type: "image", image });

    expect(a.received.slice(-2)).toEqual([
      { type: "pointer", id: "peer-2", pointer: { x: 1, y: 2 } },
      { type: "image", image },
    ]);
    expect(b.received.length).toBe(before);
  });

  it("passes on a new name and photo, and keeps them for whoever joins next", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });

    const avatar = "data:image/jpeg;base64,AA==";
    b.connection.receive({ type: "profile", name: "Bo", avatar });
    expect(a.received.at(-1)).toEqual({
      type: "presence",
      peer: {
        id: "peer-2",
        name: "Bo",
        avatar,
        color: expect.any(String),
        pointer: null,
        view: null,
        following: null,
      },
    });

    const c = connect(server);
    c.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    expect(c.received[0]).toMatchObject({
      peers: [{ name: "" }, { name: "Bo", avatar }],
    });
  });

  it("passes on what someone's in the middle of, without keeping it", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    const before = b.received.length;

    b.connection.receive({ type: "activity", activity: { drawing: true } });
    b.connection.receive({ type: "activity", activity: null });

    expect(a.received.slice(-2)).toEqual([
      { type: "activity", id: "peer-2", activity: { drawing: true } },
      { type: "activity", id: "peer-2", activity: null },
    ]);
    expect(b.received.length).toBe(before);
    const c = connect(server);
    c.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    expect(c.received).toHaveLength(1);
  });

  it("ends a room once everyone's left", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    a.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 1,
    });
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 1,
    });

    b.connection.close();
    expect(a.received.at(-1)).toEqual({ type: "left", id: "peer-2" });
    a.connection.receive({ type: "leave" });

    const c = connect(server);
    c.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 2,
    });
    expect(c.received[0]).toMatchObject({ type: "welcome", drawing: 2 });
  });

  it("ignores what isn't a message, or comes before joining", () => {
    const server = new CollaborationServer();
    const a = connect(server);
    const b = connect(server);
    b.connection.receive({
      type: "join",
      room: "r",
      name: "",
      avatar: "",
      drawing: 0,
    });
    const before = b.received.length;

    for (const message of [
      null,
      "join",
      { type: "edit", edit: { id: "e", type: "change", change: 1 } },
    ]) {
      a.connection.receive(message);
    }
    b.connection.receive({ type: "edit", edit: { type: "change" } });
    b.connection.receive({ type: "image", image: { id: "i", data: "x" } });
    b.connection.receive({ type: "pointer", pointer: { x: "1" } });
    // Only an image's data URL, or an address on the web, is a photo.
    b.connection.receive({ type: "profile", name: "", avatar: "javascript:" });
    b.connection.receive({ type: "activity" });

    expect(a.received).toEqual([]);
    expect(b.received.length).toBe(before);
  });

  describe("following", () => {
    it("passes on what someone's canvas shows to everyone else", () => {
      const [a, b] = joinAll(new CollaborationServer(), 2);
      const view = { x: 1, y: 2, width: 300, height: 200 };
      a.connection.receive({ type: "view", view });
      a.connection.receive({ type: "view", view: { ...view, width: 0 } });

      expect(b.received.at(-1)).toEqual({ type: "view", id: "peer-1", view });
      expect(a.received.at(-1)).not.toMatchObject({ type: "view" });
    });

    it("tells everyone who follows whom, until they stop", () => {
      const [a, b] = joinAll(new CollaborationServer(), 2);
      b.connection.receive({ type: "follow", id: "peer-1" });

      const followed = { type: "follow", id: "peer-2", following: "peer-1" };
      expect(a.received.at(-1)).toEqual(followed);
      expect(b.received.at(-1)).toEqual(followed);

      b.connection.receive({ type: "follow", id: null });
      expect(a.received.at(-1)).toEqual({ ...followed, following: null });
    });

    it("turns away following yourself, nobody, or in a circle", () => {
      const [a, b, c] = joinAll(new CollaborationServer(), 3);
      b.connection.receive({ type: "follow", id: "peer-1" });
      c.connection.receive({ type: "follow", id: "peer-2" });
      const before = a.received.length;

      a.connection.receive({ type: "follow", id: "peer-3" });
      a.connection.receive({ type: "follow", id: "peer-1" });
      a.connection.receive({ type: "follow", id: "peer-9" });

      expect(a.received.length).toBe(before);
    });

    it("has everyone follow whoever summons them", () => {
      const [a, b, c] = joinAll(new CollaborationServer(), 3);
      a.connection.receive({ type: "follow", id: "peer-2" });
      b.connection.receive({ type: "summon" });

      expect(c.received.slice(-2)).toEqual([
        { type: "follow", id: "peer-1", following: "peer-2" },
        { type: "follow", id: "peer-3", following: "peer-2" },
      ]);
    });

    it("lets someone release only those following them", () => {
      const [a, b, c] = joinAll(new CollaborationServer(), 3);
      b.connection.receive({ type: "follow", id: "peer-1" });
      c.connection.receive({ type: "follow", id: "peer-1" });
      b.connection.receive({ type: "release", id: "peer-3" });
      a.connection.receive({ type: "release", id: "peer-2" });

      expect(c.received.at(-1)).toEqual({
        type: "follow",
        id: "peer-2",
        following: null,
      });
      expect(c.received.at(-2)).toMatchObject({ id: "peer-3" });
    });

    it("stops following someone who leaves", () => {
      const server = new CollaborationServer();
      const [a, b] = joinAll(server, 2);
      b.connection.receive({ type: "follow", id: "peer-1" });
      a.connection.close();
      const [c] = joinAll(server, 1);

      expect(c.received[0]).toMatchObject({
        peers: [{ id: "peer-2", following: null }],
      });
    });
  });

  describe("the timer", () => {
    afterEach(() => vi.useRealTimers());

    it("goes to everyone, with how long's left, and stops for everyone", () => {
      vi.useFakeTimers({ now: 1000 });
      const server = new CollaborationServer();
      const [a, b] = joinAll(server, 2);
      b.connection.receive({
        type: "timer",
        timer: { duration: 60_000, sound: "bell" },
      });
      const timer = {
        duration: 60_000,
        remaining: 60_000,
        sound: "bell",
        by: "peer-2",
      };
      expect(a.received.at(-1)).toEqual({ type: "timer", timer });
      expect(b.received.at(-1)).toEqual({ type: "timer", timer });

      // Someone joining later is told how long's left.
      vi.advanceTimersByTime(20_000);
      const [c] = joinAll(server, 1);
      expect(c.received[0]).toMatchObject({
        timer: { ...timer, remaining: 40_000 },
      });

      a.connection.receive({ type: "timer", timer: null });
      expect(c.received.at(-1)).toEqual({ type: "timer", timer: null });
    });

    it("isn't sent once it's gone off", () => {
      vi.useFakeTimers({ now: 1000 });
      const server = new CollaborationServer();
      const [a] = joinAll(server, 1);
      a.connection.receive({
        type: "timer",
        timer: { duration: 1000, sound: "bell" },
      });
      vi.advanceTimersByTime(1000);

      expect(joinAll(server, 1)[0].received[0]).toMatchObject({
        timer: null,
      });
    });

    it("turns away a timer that can't run", () => {
      const [a] = joinAll(new CollaborationServer(), 1);
      const before = a.received.length;
      for (const timer of [
        { duration: 0, sound: "bell" },
        { duration: 1000 },
        { duration: 1e12, sound: "bell" },
        { duration: 1000, sound: "x".repeat(100) },
      ]) {
        a.connection.receive({ type: "timer", timer });
      }

      expect(a.received.length).toBe(before);
    });
  });
});
