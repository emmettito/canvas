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
import move from "@phosphor-icons/core/regular/cursor.svg?raw";
import pencil from "@phosphor-icons/core/regular/pencil-simple.svg?raw";
import highlighter from "@phosphor-icons/core/regular/highlighter.svg?raw";
import eraser from "@phosphor-icons/core/regular/eraser.svg?raw";
import bucket from "@phosphor-icons/core/regular/paint-bucket.svg?raw";
import note from "@phosphor-icons/core/regular/note.svg?raw";
import dropper from "@phosphor-icons/core/regular/eyedropper.svg?raw";
import text from "@phosphor-icons/core/regular/text-t.svg?raw";
import shape from "@phosphor-icons/core/regular/shapes.svg?raw";
import image from "@phosphor-icons/core/regular/image.svg?raw";
import close from "@phosphor-icons/core/regular/x.svg?raw";
import { type ToolbarAction } from "./index";

// Each icon's SVG markup. They fill with `currentColor`, so they follow the
// toolbar's colors.
const ICONS: Record<ToolbarAction, string> = {
  undo,
  redo,
  clear,
  "new-canvas": newCanvas,
  history,
  export: exportIcon,
  move,
  pencil,
  highlighter,
  eraser,
  bucket,
  note,
  dropper,
  text,
  shape,
  image,
};

const parser = new DOMParser();

// The page's own buttons, outside the canvas.
const PAGE_ICONS = { close };

function parseIcon(svg: string): Element {
  return parser.parseFromString(svg, "image/svg+xml").documentElement;
}

export function createIcon(action: ToolbarAction): Element {
  return parseIcon(ICONS[action]);
}

// Hidden from screen readers, since each button has its own label.
export function createPageIcon(name: keyof typeof PAGE_ICONS): Element {
  const icon = parseIcon(PAGE_ICONS[name]);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}
