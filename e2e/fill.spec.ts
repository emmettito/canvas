import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
});

// Draws a closed square outline from `x`, `y`, `size` pixels a side, in one
// stroke.
async function drawSquare(page: Page, x: number, y: number, size: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const [dx, dy] of [
    [size, 0],
    [size, size],
    [0, size],
    [0, 0],
  ]) {
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
  }
  await page.mouse.up();
}

async function pickColor(page: Page, color: string) {
  await page.getByRole("button", { name: /^Color: / }).click();
  await page.getByRole("button", { name: color, exact: true }).click();
}

// The color shown at `x`, `y`, as the dropper sees it, which is how the
// drawing's drawn and exported. Goes back to the tool before after.
async function getColorAt(page: Page, x: number, y: number) {
  const before = await page
    .getByRole("button", { name: /^Color: / })
    .getAttribute("aria-label");
  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(x, y);
  const label = await page
    .getByRole("button", { name: /^Color: / })
    .getAttribute("aria-label");
  // Put the color back, so the dropper doesn't change what's tested.
  await page.getByRole("button", { name: /^Color: / }).click();
  const name = before!.replace("Color: ", "");
  await page.getByRole("button", { name, exact: true }).first().click();
  return label!.replace("Color: ", "");
}

// The alpha on the fills' canvas, on screen, at `x`, `y`.
function getFillAlpha(page: Page, x: number, y: number) {
  return page.locator(".canvas-fills").evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const box = canvas.getBoundingClientRect();
      return canvas
        .getContext("2d")!
        .getImageData(
          Math.floor(((x - box.left) * canvas.width) / box.width),
          Math.floor(((y - box.top) * canvas.height) / box.height),
          1,
          1
        ).data[3];
    },
    [x, y]
  );
}

test("fills inside an outline, below it, and is undone", async ({ page }) => {
  await drawSquare(page, 400, 200, 200);
  await pickColor(page, "red");
  await page.keyboard.press("g");
  await expect(
    page.getByRole("button", { name: "Paint bucket" })
  ).toHaveAttribute("aria-pressed", "true");

  await page.mouse.click(500, 300);

  await expect(page.locator(".canvas-fills")).toHaveCount(1);
  expect(await getFillAlpha(page, 500, 300)).toBe(255);
  // Not outside the outline.
  expect(await getFillAlpha(page, 300, 300)).toBe(0);
  // It reaches a little under the line's soft edge, 15 pixels from its
  // middle, which is drawn over it, but not its middle.
  expect(await getFillAlpha(page, 414, 300)).toBe(255);
  expect(await getFillAlpha(page, 405, 300)).toBe(0);
  expect(await getColorAt(page, 500, 300)).toBe("red");
  expect(await getColorAt(page, 400, 300)).toBe("black");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".canvas-fills")).toHaveCount(0);
});

test("filling around everything changes nothing", async ({ page }) => {
  await drawSquare(page, 400, 200, 200);
  await pickColor(page, "blue");
  await page.getByRole("button", { name: "Paint bucket" }).click();

  await page.mouse.click(200, 500);

  await expect(page.getByRole("status")).toHaveText("Nothing closed to fill");
  // The background stays as it was.
  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await expect(page.locator(".canvas-fills")).toHaveCount(0);
  // The square, still nothing to undo past.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("filling to a note's edges changes nothing", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(500, 300);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await pickColor(page, "purple");
  await page.getByRole("button", { name: "Paint bucket" }).click();

  await page.mouse.click(500, 360);

  await expect(page.getByRole("status")).toHaveText("Nothing closed to fill");
  await expect(page.locator(".canvas-note-fills")).toHaveCount(0);
  expect(await getColorAt(page, 500, 360)).toBe("#fefe99");
});

test("fills over a fill, and the eraser erases fills before it", async ({
  page,
}) => {
  await drawSquare(page, 400, 200, 200);
  await pickColor(page, "red");
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await page.mouse.click(500, 300);
  await pickColor(page, "green");
  await page.mouse.click(500, 300);
  expect(await getColorAt(page, 500, 300)).toBe("green");

  await page.getByRole("button", { name: "Eraser" }).click();
  await page.mouse.move(450, 300);
  await page.mouse.down();
  await page.mouse.move(550, 300, { steps: 5 });
  await page.mouse.up();
  expect(await getFillAlpha(page, 500, 300)).toBe(0);
  expect(await getFillAlpha(page, 500, 250)).toBe(255);

  // A fill after the eraser isn't erased by it.
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await pickColor(page, "blue");
  await page.mouse.click(500, 300);
  expect(await getFillAlpha(page, 500, 300)).toBe(255);
});

test("fills a note's area on the note, and keeps fills", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(500, 300);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pencil" }).click();
  await drawSquare(page, 460, 250, 80);
  await pickColor(page, "purple");
  await page.getByRole("button", { name: "Paint bucket" }).click();

  await page.mouse.click(500, 290);

  await expect(page.locator(".canvas-note-fills")).toHaveCount(1);
  await expect(page.locator(".canvas-fills")).toHaveCount(0);
  expect(await getColorAt(page, 500, 290)).toBe("purple");
  // Outside the square, the note's own color.
  expect(await getColorAt(page, 500, 360)).toBe("#fefe99");

  // Moving the note moves its fill.
  await page.reload();
  await page.getByRole("button", { name: "Move" }).click();
  await page.mouse.move(440, 250);
  await page.mouse.down();
  await page.mouse.move(540, 250, { steps: 5 });
  await page.mouse.up();
  expect(await getColorAt(page, 600, 290)).toBe("purple");
});

test("fills are kept, and exported as outlines", async ({ page }) => {
  await drawSquare(page, 400, 200, 200);
  await pickColor(page, "red");
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await page.mouse.click(500, 300);

  await page.reload();
  await expect(page.locator(".canvas-fills")).toHaveCount(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const svg = (await readFile(await (await download).path())).toString();
  // Below the outline.
  expect(svg).toMatch(
    /<path d="M[^"]*Z" fill="#ff0000" fill-rule="evenodd"\/><path/
  );
});

test("fills and strokes line up with the screen, zoomed far in", async ({
  page,
}) => {
  await drawSquare(page, 400, 200, 200);
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await pickColor(page, "red");
  await page.mouse.click(500, 300);
  // Zoomed in around a point that isn't on a whole unit, which used to put
  // the canvases a few pixels out.
  await page.mouse.move(480.4, 290.6);
  await page.keyboard.down("Control");
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, -50);
  }
  await page.keyboard.up("Control");

  // The screen's top rows are the fill's red, all the way up.
  const shot = await page.screenshot({
    clip: { x: 300, y: 0, width: 1, height: 3 },
  });
  const rows = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, canvas.height).data];
  }, shot.toString("base64"));
  for (let row = 0; row < rows.length / 4; row++) {
    expect(rows.slice(row * 4, row * 4 + 3)).toEqual([255, 0, 0]);
  }
});
