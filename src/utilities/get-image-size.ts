import { type Size } from "../models/size.model";

// The size browsers give an image that has none of its own, e.g. some SVGs.
const DEFAULT_SIZE: Size = { width: 300, height: 150 };

/** An image file's size in pixels, or null if it can't be read. */
export async function getImageSize(blob: Blob): Promise<Size | null> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    return width > 0 && height > 0 ? { width, height } : DEFAULT_SIZE;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
