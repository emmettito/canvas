// Makes the demo page's favicons from an SVG exported from the canvas:
//
//   node scripts/generate-icons.ts path/to/drawing.svg
//
// The strokes are cropped to a square, simplified to keep the file small, and
// saved as public/favicon.svg. That's drawn at each size browsers and devices
// ask for, with Playwright's Chromium, into PNGs, a favicon.ico and a web app
// manifest.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PUBLIC_DIR = "public";
// How far, in drawing units, a simplified stroke can stray from the drawn one.
// The strokes are 42 units wide, so this is far too small to see.
const TOLERANCE = 0.75;
// Room around the strokes, as a share of the square's side.
const MARGIN = 0.02;
// Apple and Android fill transparency in with black, so their icons get a
// background, with room for the corners they round off.
const BACKGROUND = "#ffffff";
const TOUCH_PADDING = 0.12;
// Android may crop a maskable icon to a circle 80% as wide as it.
const MASKABLE_PADDING = 0.2;

interface Point {
  x: number;
  y: number;
}

// How far `point` is from the line through `start` and `end`.
function distanceToLine(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}

// Ramer–Douglas–Peucker: keeps only the points the line needs to stay within
// `TOLERANCE` of where it was.
function simplify(points: Point[]): Point[] {
  if (points.length < 3) {
    return points;
  }
  const start = points[0];
  const end = points.at(-1)!;
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToLine(points[i], start, end);
    if (distance > farthest) {
      farthest = distance;
      index = i;
    }
  }
  if (farthest <= TOLERANCE) {
    return [start, end];
  }
  return [
    ...simplify(points.slice(0, index + 1)).slice(0, -1),
    ...simplify(points.slice(index)),
  ];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

// The canvas exports each stroke as a path of straight lines.
function readStrokes(svg: string): Stroke[] {
  return [...svg.matchAll(/<path [^>]*\/>/g)].map(([path]) => {
    const numbers = [...path.match(/ d="([^"]*)"/)![1].matchAll(/-?\d+(?:\.\d+)?/g)].map(
      ([number]) => Number(number)
    );
    const points: Point[] = [];
    for (let i = 0; i < numbers.length; i += 2) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
    return {
      points,
      color: path.match(/ stroke="([^"]*)"/)![1],
      width: Number(path.match(/ stroke-width="([^"]*)"/)![1]),
    };
  });
}

// The strokes cropped to a square around them, without the canvas's
// background, so the icon suits light and dark browser tabs.
function createFavicon(strokes: Stroke[]): string {
  const bounds = strokes.flatMap(({ points, width }) =>
    points.flatMap(({ x, y }) => [
      { x: x - width / 2, y: y - width / 2 },
      { x: x + width / 2, y: y + width / 2 },
    ])
  );
  const left = Math.min(...bounds.map(({ x }) => x));
  const right = Math.max(...bounds.map(({ x }) => x));
  const top = Math.min(...bounds.map(({ y }) => y));
  const bottom = Math.max(...bounds.map(({ y }) => y));
  const side = Math.max(right - left, bottom - top) * (1 + MARGIN * 2);
  const x = round((left + right - side) / 2);
  const y = round((top + bottom - side) / 2);
  const paths = strokes
    .map(({ points, color, width }) => {
      const d = simplify(points)
        .map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`)
        .join("");
      return `<path d="${d}" stroke="${color}" stroke-width="${width}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${round(side)} ${round(side)}"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>\n`;
}

// An .ico holding each PNG as it is, which every browser reads.
function createIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    // 0 means 256 or more.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]);
}

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/generate-icons.ts path/to/drawing.svg");
  process.exit(1);
}
const favicon = createFavicon(readStrokes(readFileSync(source, "utf8")));
writeFileSync(`${PUBLIC_DIR}/favicon.svg`, favicon);

const browser = await chromium.launch();
const page = await browser.newPage();
const url = `data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`;

// The icon drawn `size` pixels square, with `padding` around it as a share of
// the size, over `background` or transparent.
async function render(size: number, padding = 0, background?: string): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  const inner = size * (1 - padding * 2);
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:${size}px;background:${background ?? "transparent"}"><img src="${url}" width="${inner}" height="${inner}"></body>`
  );
  await page.locator("img").evaluate((image: HTMLImageElement) => image.decode());
  return page.screenshot({ omitBackground: !background });
}

const icoSizes = [16, 32, 48];
const icoPngs = [];
for (const size of icoSizes) {
  icoPngs.push({ size, data: await render(size) });
}
writeFileSync(`${PUBLIC_DIR}/favicon.ico`, createIco(icoPngs));
writeFileSync(
  `${PUBLIC_DIR}/apple-touch-icon.png`,
  await render(180, TOUCH_PADDING, BACKGROUND)
);
writeFileSync(`${PUBLIC_DIR}/icon-192.png`, await render(192));
writeFileSync(`${PUBLIC_DIR}/icon-512.png`, await render(512));
writeFileSync(
  `${PUBLIC_DIR}/icon-maskable-512.png`,
  await render(512, MASKABLE_PADDING, BACKGROUND)
);
await browser.close();

// Paths are relative to the manifest, so they work wherever the page is
// served from, e.g. GitHub Pages' /canvas/.
const manifest = {
  name: "Canvas",
  short_name: "Canvas",
  description: "A simple art canvas.",
  start_url: ".",
  display: "standalone",
  background_color: BACKGROUND,
  theme_color: BACKGROUND,
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
writeFileSync(
  `${PUBLIC_DIR}/manifest.webmanifest`,
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log("Made the favicons in public/.");
