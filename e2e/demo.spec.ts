import { expect, test } from "@playwright/test";

// The demo page, which is only for drawing. The rest of the tests use the
// test page with every control, `e2e/fixtures/full.html`.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

test("the canvas fills the window, with the tools at the bottom and the zoom at the top right", async ({
  page,
}) => {
  const viewport = page.viewportSize()!;
  expect(await page.locator("canvas").boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });

  const pencil = (await page
    .getByRole("button", { name: "Pencil" })
    .boundingBox())!;
  expect(viewport.height - (pencil.y + pencil.height)).toBeLessThan(40);
  const zoom = (await page
    .getByRole("button", { name: /^Zoom: / })
    .boundingBox())!;
  expect(zoom.y).toBeLessThan(40);
  expect(viewport.width - (zoom.x + zoom.width)).toBeLessThan(40);
});

test("there's nothing but drawing: no File menu, timer, or people", async ({
  page,
}) => {
  await expect(page.locator(".canvas-toolbar")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "File" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Timer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
});

test("a refresh starts again", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Gone soon");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-note")).toHaveCount(1);

  await page.reload();

  await expect(page.locator(".canvas-note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
