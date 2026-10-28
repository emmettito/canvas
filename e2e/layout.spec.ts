import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
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

  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(undo).toBeHidden();
  await expect(file).toBeHidden();
  // The canvas keeps its size.
  const viewport = page.viewportSize()!;
  expect((await page.locator("canvas").boundingBox())!.width).toBe(
    viewport.width
  );

  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(undo).toBeVisible();
  await expect(file).toBeVisible();
});

test("hiding the toolbars closes an open menu", async ({ page }) => {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.locator(".canvas-menu")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Backslash");
  await page.keyboard.press("ControlOrMeta+Backslash");

  await expect(page.locator(".canvas-menu")).toHaveCount(0);
});
