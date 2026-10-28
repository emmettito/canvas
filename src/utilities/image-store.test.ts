import { describe, expect, it } from "vitest";
import { ImageStore } from "./image-store";

const FILE = new Blob(["image"], { type: "image/png" });

// Without a key, files are kept in memory. The browser tests cover IndexedDB.
describe("ImageStore", () => {
  it("keeps a file in memory without a key", async () => {
    const store = new ImageStore();

    expect(await store.put("canvas", "a", FILE)).toBe(true);

    expect(await store.get("canvas", "a")).toBe(FILE);
    expect(await new ImageStore().get("canvas", "a")).toBeNull();
  });

  it("removes a canvas's files when it's deleted", async () => {
    const store = new ImageStore();
    await store.put("one", "a", FILE);
    await store.put("two", "b", FILE);

    await store.deleteCanvas("one");

    expect(await store.get("one", "a")).toBeNull();
    expect(await store.get("two", "b")).toBe(FILE);
  });

  it("prunes a canvas's files that aren't kept", async () => {
    const store = new ImageStore();
    await store.put("one", "a", FILE);
    await store.put("one", "b", FILE);
    await store.put("two", "c", FILE);

    await store.prune("one", ["a"]);

    expect(await store.get("one", "a")).toBe(FILE);
    expect(await store.get("one", "b")).toBeNull();
    expect(await store.get("two", "c")).toBe(FILE);
  });
});
