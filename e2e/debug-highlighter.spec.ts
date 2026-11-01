// TEMPORARY: diagnoses the highlighter test failing on Linux WebKit only.
import { test } from "@playwright/test";
import { getSquareOutlines } from "../src/utilities/stroke-pieces";

const points = [];
for (let i = 0; i <= 10; i++) points.push({ x: 320 + 64 * i, y: 360 });
for (let i = 1; i <= 10; i++)
  points.push({ x: 960 - 64 * i, y: 360 + 0.2 * i });
const outlines = getSquareOutlines({
  color: "#fcfd00",
  size: 10,
  opacity: 0.4,
  cap: "square",
  points,
});

test("debug: which fills Linux WebKit draws", async ({ page }) => {
  await page.goto("/e2e/fixtures/full.html");
  const results = await page.evaluate((outlines) => {
    type Pt = { x: number; y: number };
    const trace = (context: CanvasPath, list: Pt[][]) =>
      list.forEach(([first, ...rest]) => {
        context.moveTo(first.x, first.y);
        rest.forEach(({ x, y }) => context.lineTo(x, y));
        context.closePath();
      });
    const run = (
      draw: (context: CanvasRenderingContext2D) => void,
      alpha = 0.4
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = 2560;
      canvas.height = 1440;
      const context = canvas.getContext("2d")!;
      context.scale(2, 2);
      context.fillStyle = "#fcfd00";
      context.globalAlpha = alpha;
      draw(context);
      const data = context.getImageData(0, 0, 2560, 1440).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
      return painted;
    };
    const one =
      (list: Pt[][], rule?: CanvasFillRule) =>
      (c: CanvasRenderingContext2D) => {
        c.beginPath();
        trace(c, list);
        c.fill(rule);
      };
    return {
      all: run(one(outlines)),
      allSolid: run(one(outlines), 1),
      allEvenOdd: run(one(outlines, "evenodd")),
      first10: run(one(outlines.slice(0, 10))),
      first100: run(one(outlines.slice(0, 100))),
      first300: run(one(outlines.slice(0, 300))),
      forwardHalf: run(one(outlines.slice(0, 305))),
      backHalf: run(one(outlines.slice(305))),
      eachSeparately: run((c) => outlines.forEach((o) => one([o])(c))),
      path2d: run((c) => {
        const path = new Path2D();
        trace(path, outlines);
        c.fill(path);
      }),
    };
  }, outlines);
  console.log("DEBUG " + JSON.stringify(results));
});
