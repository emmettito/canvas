// TEMPORARY: diagnoses the highlighter test failing on Linux WebKit only.
import { expect, test } from "@playwright/test";

test("debug: what the highlighter draws", async ({ page }, testInfo) => {
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator("canvas")).toBeVisible();
  await page.keyboard.press("h");
  const box = (await page.locator("canvas").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 3) / 4, y, { steps: 10 });
  await page.mouse.move(box.x + box.width / 4, y + 2, { steps: 10 });
  await page.mouse.up();
  const info = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")];
    const strokes = Object.entries(localStorage)
      .filter(([key]) => key.endsWith(":strokes"))
      .flatMap(([, value]) => JSON.parse(value));
    return {
      dpr: devicePixelRatio,
      ua: navigator.userAgent,
      canvases: canvases.map((canvas) => {
        const context = canvas.getContext("2d")!;
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) {
            painted++;
            const p = (i - 3) / 4;
            const px = p % canvas.width, py = Math.floor(p / canvas.width);
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
        }
        const row = Math.floor(canvas.height / 2);
        const samples = [];
        for (let i = 0; i < 20; i++) {
          const x = Math.floor((canvas.width * i) / 20);
          samples.push([...context.getImageData(x, row, 1, 1).data]);
        }
        return {
          className: canvas.className,
          size: [canvas.width, canvas.height],
          css: [canvas.clientWidth, canvas.clientHeight],
          transform: context.getTransform().toString(),
          painted,
          bounds: [minX, minY, maxX, maxY],
          samples,
        };
      }),
      strokes: strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.slice(0, 5),
        count: stroke.points.length,
      })),
    };
  });
  console.log("DEBUG " + JSON.stringify(info));
  await testInfo.attach("screen", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
