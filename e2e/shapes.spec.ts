import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
});

// Drags from `from` to `to` on screen, with `modifiers` held.
async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  modifiers: string[] = []
) {
  for (const key of modifiers) {
    await page.keyboard.down(key);
  }
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 6 });
  await page.mouse.up();
  for (const key of modifiers) {
    await page.keyboard.up(key);
  }
}

// Where each shape is on screen, rounded, and what kind it is.
function getShapes(page: Page) {
  return page.locator(".canvas-shape").evaluateAll((shapes) =>
    shapes.map((shape) => {
      const box = shape.getBoundingClientRect();
      return {
        type: (shape as HTMLElement).dataset.type,
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    })
  );
}

test("dragging with the shape tool draws a shape, which can be undone", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await drag(page, [300, 200], [400, 260]);

  expect(await getShapes(page)).toEqual([
    { type: "rectangle", x: 300, y: 200, width: 100, height: 60 },
  ]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-shape")).toHaveCount(0);
});

test("clicking the shape tool again picks the shape, and keys pick each", async ({
  page,
}) => {
  const shape = page.getByRole("button", { name: "Shape", exact: true });
  await shape.click();
  await shape.click();
  await page.getByRole("button", { name: /^Ellipse/ }).click();
  await drag(page, [200, 200], [300, 260]);
  await page.keyboard.press("l");
  await drag(page, [400, 200], [500, 260]);
  await page.keyboard.press("a");
  await drag(page, [600, 200], [700, 260]);

  expect((await getShapes(page)).map(({ type }) => type)).toEqual([
    "ellipse",
    "line",
    "arrow",
  ]);
  await expect(shape).toHaveAttribute("aria-pressed", "true");
});

test("Shift draws a square, and a line at an eighth of a turn", async ({
  page,
}) => {
  await page.keyboard.press("r");
  await drag(page, [200, 200], [300, 240], ["Shift"]);
  await page.keyboard.press("l");
  await drag(page, [400, 200], [500, 210], ["Shift"]);

  const [square, line] = await getShapes(page);
  expect(square.width).toBe(square.height);
  expect(line.height).toBe(0);
});

test("a shape is moved by its outline, and its empty middle lets presses through", async ({
  page,
}) => {
  await page.keyboard.press("r");
  await drag(page, [300, 200], [400, 300]);
  await page.getByRole("button", { name: "Move" }).click();

  // Its middle is the drawing's, which pans.
  await drag(page, [350, 250], [350, 260]);
  expect((await getShapes(page))[0].y).toBe(210);

  // Its outline moves it.
  await drag(page, [350, 210], [350, 160]);
  expect((await getShapes(page))[0].y).toBe(160);
});

test("dragging a line's end swings it round its start", async ({ page }) => {
  await page.keyboard.press("a");
  await drag(page, [300, 300], [400, 300]);
  await page.getByRole("button", { name: "Move" }).click();

  await drag(page, [400, 300], [200, 400]);

  expect(await getShapes(page)).toEqual([
    { type: "arrow", x: 200, y: 300, width: 100, height: 100 },
  ]);
});

test("the paint bucket fills a shape it's pressed inside", async ({ page }) => {
  await page.keyboard.press("o");
  await drag(page, [300, 200], [400, 300]);
  await page.getByRole("button", { name: "Paint bucket" }).click();
  await page.mouse.click(350, 250);

  await expect(page.locator(".canvas-shape")).toHaveAttribute(
    "data-filled",
    ""
  );
  await expect(page.locator(".canvas-shape-path")).not.toHaveAttribute(
    "fill",
    "none"
  );
});

test("shapes are kept after a reload, and exported as SVG paths", async ({
  page,
}) => {
  await page.keyboard.press("r");
  await drag(page, [300, 200], [400, 300]);
  await page.reload();

  await expect(page.locator(".canvas-shape")).toHaveCount(1);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG" }).check();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const svg = await readFile((await (await downloading).path())!, "utf8");
  expect(svg).toMatch(/<path d="M[^"]*Z" fill="none" stroke="#[0-9a-f]+"/);
});
