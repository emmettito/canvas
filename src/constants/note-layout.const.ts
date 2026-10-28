// How a sticky note is laid out, in drawing units, so the note on screen and
// the exported one match at any scale.
export const NOTE_LAYOUT = {
  // A new note's width and height.
  size: 160,
  // The smallest a note can be resized to.
  minSize: 48,
  padding: 12,
  fontSize: 16,
  // A multiple of the font size.
  lineHeight: 1.35,
  cornerRadius: 4,
};
