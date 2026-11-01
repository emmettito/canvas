import { describe, expect, it } from "vitest";
import { addPngText, crc32, createTextChunk } from "./png-text";

// The signature, then an IHDR chunk for a 1×1 image, with its real CRC.
const HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
];
// Stands in for the image's other chunks.
const REST = [1, 2, 3];

describe("createTextChunk", () => {
  it("makes an iTXt chunk with its length, keyword, text and CRC", () => {
    const chunk = createTextChunk("Author", "Zoë");
    const view = new DataView(chunk.buffer);
    const text = new TextDecoder();
    // "Author", five zero bytes, and "Zoë" in UTF-8, which is 4 bytes.
    expect(view.getUint32(0)).toBe(6 + 5 + 4);
    expect(text.decode(chunk.subarray(4, 8))).toBe("iTXt");
    expect(text.decode(chunk.subarray(8, 14))).toBe("Author");
    expect([...chunk.subarray(14, 19)]).toEqual([0, 0, 0, 0, 0]);
    expect(text.decode(chunk.subarray(19, 23))).toBe("Zoë");
    expect(chunk.length).toBe(4 + 4 + 15 + 4);
  });

  it("ends with the CRC of its type and data", () => {
    const chunk = createTextChunk("Author", "Ada");
    const crc = new DataView(chunk.buffer).getUint32(chunk.length - 4);
    expect(crc).toBe(crc32(chunk.subarray(4, chunk.length - 4)));
  });
});

describe("crc32", () => {
  it("matches a real PNG's IHDR CRC", () => {
    expect(crc32(new Uint8Array(HEADER.slice(12, 29)))).toBe(0x1f15c489);
  });
});

describe("addPngText", () => {
  it("puts the chunk straight after the header", async () => {
    const png = new Blob([new Uint8Array([...HEADER, ...REST])], {
      type: "image/png",
    });
    const result = await addPngText(png, "Author", "Ada");
    const bytes = new Uint8Array(await result.arrayBuffer());
    const chunk = createTextChunk("Author", "Ada");
    expect(result.type).toBe("image/png");
    expect([...bytes]).toEqual([...HEADER, ...chunk, ...REST]);
  });
});
