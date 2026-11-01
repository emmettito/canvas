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
  // The author's name along a signed note's bottom, inside its padding, on
  // one line at the same line height. The text above it has that much less
  // room.
  bylineSize: 11,
  // How much of the note's text color the byline is, so it's quieter.
  bylineOpacity: 0.6,
};
