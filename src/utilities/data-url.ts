/** A file as a data URL, e.g. to send an image as text. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * The file in a base64 data URL, or null if it isn't one. It's read straight
 * away, rather than fetched, so it's there before anything after it.
 */
export function dataUrlToBlob(url: string): Blob | null {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(url);
  if (!match) {
    return null;
  }
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: match[1] });
  } catch {
    // Not base64 after all.
    return null;
  }
}
