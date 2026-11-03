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
  // The tools, the pencil's options, and the zoom.
  await expect(page.locator(".canvas-toolbar:visible")).toHaveCount(3);
  await expect(
    page.getByRole("toolbar", { name: "Pencil options" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "File" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Timer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dropper" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Color: / })).toHaveCount(0);
});

test("it can select and pan, and undoes from the keyboard, with no buttons", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redo" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Back soon");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-note")).toHaveCount(1);

  await page.mouse.move(600, 500);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-note")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".canvas-note")).toHaveCount(1);
});

test("a refresh keeps the drawing", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Still here");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-note")).toHaveCount(1);

  await page.reload();

  await expect(page.locator(".canvas-note")).toHaveText("Still here");
  // With the tool last picked, but not what to undo.
  await expect(
    page.getByRole("button", { name: "Sticky note" })
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(400, 300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-note")).toHaveCount(1);
});

test("clearing asks first, and can't be undone", async ({ page }) => {
  const clear = page.getByRole("button", { name: "Clear", exact: true });
  await expect(clear).toBeDisabled();
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Keep me");
  await page.keyboard.press("Escape");
  const popover = page.locator(".canvas-popover");

  await clear.click();
  await expect(popover.getByText("Clear the canvas?")).toBeVisible();
  await popover.getByRole("button", { name: "Cancel" }).click();
  await expect(popover).toBeHidden();
  await expect(page.locator(".canvas-note")).toHaveCount(1);

  await clear.click();
  await popover.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect(page.locator(".canvas-note")).toHaveCount(0);
  await expect(clear).toBeDisabled();
  await page.mouse.move(400, 300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-note")).toHaveCount(0);
});

test("the export dialog names the canvas as it's typed", async ({ page }) => {
  await expect(page).toHaveTitle("Untitled – Canvas Demo");
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // In the middle of the window.
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, -1);

  const name = dialog.getByRole("textbox", { name: "Name" });
  await expect(name).toHaveValue("");
  await name.fill("Sunset");
  await expect(page).toHaveTitle("Sunset – Canvas Demo");

  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  expect((await downloading).suggestedFilename()).toBe("Sunset.png");
  await expect(dialog).toBeHidden();

  // It's kept, and the dialog starts from it.
  await page.reload();
  await expect(page).toHaveTitle("Sunset – Canvas Demo");
  await page.getByRole("button", { name: "Export" }).click();
  await expect(name).toHaveValue("Sunset");
});

test("the export dialog closes with Escape, or a press outside it", async ({
  page,
}) => {
  const exportButton = page.getByRole("button", { name: "Export" });
  const dialog = page.getByRole("dialog");

  await exportButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await exportButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeHidden();
  // Nothing was drawn by the press.
  await expect(
    page.getByRole("button", { name: "Clear", exact: true })
  ).toBeDisabled();
});
