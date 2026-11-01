import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator("canvas")).toBeVisible();
});

test("the canvas fills the window, under the toolbars", async ({ page }) => {
  const viewport = page.viewportSize()!;

  const canvas = (await page.locator("canvas").boundingBox())!;

  expect(canvas).toEqual({
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });
});

test("Ctrl+\\ or Cmd+\\ hides and shows the toolbars", async ({ page }) => {
  const undo = page.getByRole("button", { name: "Undo" });
  const file = page.getByRole("button", { name: "File", exact: true });
  const zoom = page.getByRole("button", { name: /^Zoom: / });

  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(undo).toBeHidden();
  await expect(file).toBeHidden();
  await expect(zoom).toBeHidden();
  // The canvas keeps its size.
  const viewport = page.viewportSize()!;
  expect((await page.locator("canvas").boundingBox())!.width).toBe(
    viewport.width
  );

  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(undo).toBeVisible();
  await expect(file).toBeVisible();
  await expect(zoom).toBeVisible();
});

test("the zoom is at the top right, apart from the tools", async ({ page }) => {
  const viewport = page.viewportSize()!;
  const zoom = (await page
    .getByRole("button", { name: /^Zoom: / })
    .boundingBox())!;

  expect(zoom.y).toBeLessThan(40);
  expect(viewport.width - (zoom.x + zoom.width)).toBeLessThan(40);

  // The zoom's menu opens down, inside the window.
  await page.getByRole("button", { name: /^Zoom: / }).click();
  const menu = (await page.locator(".canvas-popover").boundingBox())!;
  expect(menu.y).toBeGreaterThan(zoom.y + zoom.height);
  expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
  expectNear(menu.x + menu.width, zoom.x + zoom.width + 5);
});

function expectNear(received: number, expected: number, within = 1) {
  expect(Math.abs(received - expected)).toBeLessThanOrEqual(within);
}

test("hiding the toolbars closes an open menu", async ({ page }) => {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.locator(".canvas-menu")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Backslash");
  await page.keyboard.press("ControlOrMeta+Backslash");

  await expect(page.locator(".canvas-menu")).toHaveCount(0);
});

test("pressing outside the File menu closes it, even on the canvas", async ({
  page,
}) => {
  const file = page.getByRole("button", { name: "File", exact: true });
  const menu = page.locator(".canvas-menu");
  const viewport = page.viewportSize()!;

  // With each tool, since some keep the press to themselves, e.g. to pan.
  for (const tool of ["Move", "Pencil", "Eraser", "Dropper"]) {
    await page.getByRole("button", { name: new RegExp(`^${tool}`) }).click();
    await file.click();
    await expect(menu).toBeVisible();

    await page.mouse.click(viewport.width / 2, viewport.height / 2);

    await expect(menu).toHaveCount(0);
  }
});
