import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Adds a note centered at `x` and `y` on screen, which shows where the
// drawing is.
async function addNote(page: Page, x = 400, y = 300) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(x, y);
  await page.keyboard.type("Here");
  await page.keyboard.press("Escape");
  // Back to the pencil, so presses on the canvas don't add notes.
  await page.getByRole("button", { name: "Pencil" }).click();
}

async function getNoteBox(page: Page) {
  return (await page.locator(".canvas-note").boundingBox())!;
}

function getZoomButton(page: Page) {
  return page.getByRole("button", { name: /^Zoom: / });
}

// Within a pixel, as positions can be rounded.
function expectNear(received: number, expected: number, within = 1) {
  expect(Math.abs(received - expected)).toBeLessThanOrEqual(within);
}

test("starts at 100%, and zooms in and out from its menu", async ({ page }) => {
  await addNote(page);
  const before = await getNoteBox(page);
  await expect(getZoomButton(page)).toHaveText("100%");

  await getZoomButton(page).click();
  await page.getByRole("button", { name: /^Zoom in/ }).click();

  await expect(getZoomButton(page)).toHaveText("150%");
  // The note's drawn half as big again.
  expectNear((await getNoteBox(page)).width, before.width * 1.5);

  await getZoomButton(page).click();
  await page.getByRole("button", { name: /^Zoom to 100%/ }).click();
  await expect(getZoomButton(page)).toHaveText("100%");
  expectNear((await getNoteBox(page)).x, before.x);
});

test("Ctrl+scroll zooms around the pointer", async ({ page }) => {
  await addNote(page, 300, 250);
  const before = await getNoteBox(page);
  const center = {
    x: before.x + before.width / 2,
    y: before.y + before.height / 2,
  };

  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");

  // e to the power of 1 times as big.
  await expect(getZoomButton(page)).toHaveText("272%");
  const after = await getNoteBox(page);
  expectNear(after.width, before.width * Math.E, 2);
  // What was under the pointer still is.
  expectNear(after.x + after.width / 2, center.x);
  expectNear(after.y + after.height / 2, center.y);
});

test("scrolling pans", async ({ page }) => {
  await addNote(page);
  const before = await getNoteBox(page);

  await page.mouse.move(600, 400);
  await page.mouse.wheel(50, 100);

  const after = await getNoteBox(page);
  expectNear(after.x, before.x - 50);
  expectNear(after.y, before.y - 100);
  await expect(getZoomButton(page)).toHaveText("100%");
});

test("dragging with Space held pans, even over a note", async ({ page }) => {
  await addNote(page);
  const before = await getNoteBox(page);
  // The Pencil button has focus, but the pointer's over the drawing.
  await page.mouse.move(before.x + 20, before.y + 20);

  await page.keyboard.down("Space");
  await expect(page.locator(".canvas-surface")).toHaveAttribute("data-panning");
  await page.mouse.move(before.x + 20, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 70, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");

  // Space didn't press the Pencil button, which opens its size.
  await expect(page.getByRole("slider", { name: "Pencil size" })).toHaveCount(
    0
  );
  const after = await getNoteBox(page);
  expectNear(after.x, before.x + 100);
  expectNear(after.y, before.y + 50);
  // It panned rather than moving the note, so undoing undoes adding it.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".canvas-note")).toHaveCount(0);
});

test("dragging with the middle button pans without drawing", async ({
  page,
}) => {
  await addNote(page);
  const before = await getNoteBox(page);

  await page.mouse.move(600, 400);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(560, 380, { steps: 5 });
  await page.mouse.up({ button: "middle" });

  const after = await getNoteBox(page);
  expectNear(after.x, before.x - 40);
  expectNear(after.y, before.y - 20);
  await page.getByRole("button", { name: "Undo" }).click();
  // Only the note was added, so undoing removes it, with no stroke left.
  await expect(page.locator(".canvas-note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("keyboard shortcuts zoom, like Figma's", async ({ page }) => {
  await addNote(page);
  await page.mouse.move(600, 400);

  await page.keyboard.press("ControlOrMeta+Equal");
  await expect(getZoomButton(page)).toHaveText("150%");
  await page.keyboard.press("ControlOrMeta+Minus");
  await page.keyboard.press("ControlOrMeta+Minus");
  await expect(getZoomButton(page)).toHaveText("75%");
  await page.keyboard.press("ControlOrMeta+Digit0");
  await expect(getZoomButton(page)).toHaveText("100%");

  // Shift+1 fits the note in the window.
  await page.keyboard.press("Shift+Digit1");
  const note = await getNoteBox(page);
  const viewport = page.viewportSize()!;
  expectNear(note.x + note.width / 2, viewport.width / 2);
  expectNear(note.y + note.height / 2, viewport.height / 2);
  // As big as fits, with a tenth of the height spare at each end.
  expectNear(note.height, viewport.height * 0.8);
});

test("placing a note zoomed in puts it under the pointer", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Equal");
  await page.keyboard.press("ControlOrMeta+Equal");
  await expect(getZoomButton(page)).toHaveText("200%");

  await addNote(page, 500, 350);

  const note = await getNoteBox(page);
  expectNear(note.x + note.width / 2, 500);
  expectNear(note.y + note.height / 2, 350);
  // 160 units, at 200%.
  expectNear(note.width, 320);
});

test("each canvas keeps its view after a reload", async ({ page }) => {
  await addNote(page);
  await page.keyboard.press("ControlOrMeta+Equal");
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 120);
  const before = await getNoteBox(page);

  // The view is saved once scrolling pauses.
  await page.waitForTimeout(500);
  await page.reload();

  await expect(getZoomButton(page)).toHaveText("150%");
  const after = await getNoteBox(page);
  expectNear(after.x, before.x);
  expectNear(after.y, before.y);
});

test("exports what the canvas shows at its zoom", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Equal");
  await page.keyboard.press("ControlOrMeta+Equal");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "1×" }).check();

  // At 200%, the window shows half as many drawing units each way.
  const viewport = page.viewportSize()!;
  await expect(dialog.locator(".canvas-export-size")).toHaveText(
    `${viewport.width / 2} × ${viewport.height / 2} px`
  );
});

test("pinching with two fingers zooms and pans", async ({
  browser,
  browserName,
}) => {
  // Real touches are sent through Chromium's DevTools protocol.
  test.skip(browserName !== "chromium");
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.goto("/");
  await addNote(page);
  const before = await getNoteBox(page);
  const client = await context.newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[]
  ) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point, id) => ({ ...point, id })),
    });

  // Two fingers 100 pixels apart spread to 200, around the same middle.
  await touch("touchStart", [
    { x: 550, y: 400 },
    { x: 650, y: 400 },
  ]);
  for (let step = 1; step <= 10; step++) {
    const spread = 50 + step * 5;
    await touch("touchMove", [
      { x: 600 - spread, y: 400 },
      { x: 600 + spread, y: 400 },
    ]);
  }
  await touch("touchEnd", []);

  await expect(getZoomButton(page)).toHaveText("200%");
  expectNear((await getNoteBox(page)).width, before.width * 2, 2);
  // Pinching drew nothing.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await context.close();
});
