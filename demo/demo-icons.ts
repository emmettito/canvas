/*
 * The demo page's toolbar icons, from Phosphor's regular weight
 * (https://phosphoricons.com, MIT license). The library has none of its own:
 * each toolbar button shows the icon the host page gives it.
 */
import undo from "@phosphor-icons/core/regular/arrow-u-up-left.svg?raw";
import redo from "@phosphor-icons/core/regular/arrow-u-up-right.svg?raw";
import clear from "@phosphor-icons/core/regular/trash.svg?raw";
import newCanvas from "@phosphor-icons/core/regular/file-plus.svg?raw";
import history from "@phosphor-icons/core/regular/clock-counter-clockwise.svg?raw";
import exportIcon from "@phosphor-icons/core/regular/download-simple.svg?raw";
import select from "@phosphor-icons/core/regular/cursor.svg?raw";
import hand from "@phosphor-icons/core/regular/hand.svg?raw";
import pencil from "@phosphor-icons/core/regular/pencil-simple.svg?raw";
import highlighter from "@phosphor-icons/core/regular/highlighter.svg?raw";
import eraser from "@phosphor-icons/core/regular/eraser.svg?raw";
import bucket from "@phosphor-icons/core/regular/paint-bucket.svg?raw";
import note from "@phosphor-icons/core/regular/note.svg?raw";
import dropper from "@phosphor-icons/core/regular/eyedropper.svg?raw";
import text from "@phosphor-icons/core/regular/text-t.svg?raw";
import image from "@phosphor-icons/core/regular/image.svg?raw";

// Each icon's SVG markup. They fill with `currentColor`, so they follow the
// toolbar's colors.
const ICONS = {
  undo,
  redo,
  clear,
  "new-canvas": newCanvas,
  history,
  export: exportIcon,
  select,
  hand,
  pencil,
  highlighter,
  eraser,
  bucket,
  note,
  dropper,
  text,
  image,
};

const parser = new DOMParser();

export function createIcon(name: keyof typeof ICONS): Element {
  return parser.parseFromString(ICONS[name], "image/svg+xml").documentElement;
}
