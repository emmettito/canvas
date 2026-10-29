// A PNG's 8-byte signature, then its IHDR chunk: 4 bytes of length, 4 of
// type, 13 of data and 4 of CRC. Text goes straight after it.
const AFTER_HEADER = 8 + 4 + 4 + 13 + 4;

let crcTable: Uint32Array | null = null;

/** The CRC-32 PNG checks each chunk's type and data with, from its spec. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * An iTXt chunk, which holds `text` under `keyword`, e.g. "Author", one of
 * PNG's own. iTXt rather than tEXt, since its text is UTF-8, so any name
 * fits.
 */
export function createTextChunk(keyword: string, text: string): Uint8Array {
  const encoder = new TextEncoder();
  // The keyword, then no compression and no language or translated keyword.
  const data = new Uint8Array([
    ...encoder.encode(keyword),
    0,
    0,
    0,
    0,
    0,
    ...encoder.encode(text),
  ]);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(encoder.encode("iTXt"), 4);
  chunk.set(data, 8);
  // Of the type and data.
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** The PNG in `blob`, with `text` kept under `keyword`, e.g. its author. */
export async function addPngText(
  blob: Blob,
  keyword: string,
  text: string
): Promise<Blob> {
  return new Blob(
    [
      blob.slice(0, AFTER_HEADER),
      createTextChunk(keyword, text),
      blob.slice(AFTER_HEADER),
    ],
    { type: blob.type }
  );
}
