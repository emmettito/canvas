import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { type Download, expect, type Page, test } from "@playwright/test";

// Drags across the middle of the drawing surface.
async function drawLine(page: Page) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) {
    throw new Error("Canvas is not visible");
  }
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 3) / 4, y, { steps: 10 });
  await page.mouse.up();
}

// Whether the pixel at a fraction of the canvas's width and height is drawn on.
function isDrawnAt(page: Page, x: number, y: number) {
  return page
    .locator("canvas")
    .evaluate(
      (canvas: HTMLCanvasElement, [x, y]) =>
        canvas
          .getContext("2d")!
          .getImageData(
            Math.floor(canvas.width * x),
            Math.floor(canvas.height * y),
            1,
            1
          ).data[3] > 0,
      [x, y]
    );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Picks an item from the File menu.
async function chooseFromFileMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: item, exact: true }).click();
}

// Renames the canvas from the File menu, pressing Enter to save.
async function renameCanvas(page: Page, name: string) {
  await chooseFromFileMenu(page, "Rename");
  const field = page.getByRole("textbox", { name: "Canvas name" });
  await field.fill(name);
  await field.press("Enter");
}

// Exports from the File menu, first picking `choices` in its dialog, e.g.
// ["JPEG", "1×"], and returns the download.
async function exportCanvas(
  page: Page,
  choices: string[] = []
): Promise<Download> {
  await chooseFromFileMenu(page, "Export");
  const dialog = page.locator(".canvas-export");
  for (const choice of choices) {
    await dialog.getByRole("radio", { name: choice, exact: true }).check();
  }
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  return download;
}

// The downloaded file's contents.
async function readDownload(download: Download): Promise<Buffer> {
  return readFile(await download.path());
}

// The alpha of a PNG's top-left pixel: 0 where it's transparent. Row filters
// leave the first row's first pixel as it is, so it's read straight from the
// decompressed data, after the row's filter byte.
function getCornerAlpha(png: Buffer): number {
  // The header's color type: 6 has alpha, and 2 is opaque RGB.
  const colorType = png[25];
  if (colorType !== 6) {
    return 255;
  }
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    // The length, type and checksum around the data.
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks))[4];
}

// The names in the history, most recently edited first. The history is
// opened from the File menu to read them, and left open.
async function getHistoryNames(page: Page): Promise<string[]> {
  await chooseFromFileMenu(page, "Open");
  return page.locator(".canvas-history-name").allTextContents();
}

// An item in the File menu, which is opened to find it.
async function getFileMenuItem(page: Page, item: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  return page.getByRole("button", { name: item, exact: true });
}

test("starts with the pencil selected and nothing to undo", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Pencil" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
});

test("drawing a stroke can be undone and redone", async ({ page }) => {
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });

  await drawLine(page);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
});

test("picking a color updates the color button", async ({ page }) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();

  await expect(page.getByRole("button", { name: "Color: red" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "red", exact: true })
  ).toBeHidden();
});

test("clicking the active tool opens its size slider", async ({ page }) => {
  const pencil = page.getByRole("button", { name: "Pencil" });
  const slider = page.getByRole("slider", { name: "Pencil size" });

  await pencil.click();
  await expect(slider).toBeFocused();

  // Safari doesn't focus buttons on click, so this checks focus still returns
  // to the button there.
  await page.keyboard.press("Escape");
  await expect(slider).toBeHidden();
  await expect(pencil).toBeFocused();
});

test("a popover opened from the keyboard returns focus on escape", async ({
  page,
}) => {
  const color = page.getByRole("button", { name: "Color: black" });

  await color.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "black", exact: true })
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "black", exact: true })
  ).toBeHidden();
  await expect(color).toBeFocused();
});

test("exporting saves a PNG at the size it shows", async ({ page }) => {
  await drawLine(page);
  await chooseFromFileMenu(page, "Export");
  const dialog = page.locator(".canvas-export");
  // 2× is the default, for sharp images on most screens.
  await expect(dialog.getByRole("radio", { name: "2×" })).toBeChecked();
  await dialog.getByRole("radio", { name: "1×" }).check();
  const shown = await dialog.locator(".canvas-export-size").textContent();

  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe("Untitled.png");
  const png = await readDownload(download);
  // A PNG's width and height are at these offsets in its header.
  expect(`${png.readUInt32BE(16)} × ${png.readUInt32BE(20)} px`).toBe(shown);
});

test("a transparent PNG leaves out the canvas color", async ({ page }) => {
  const filled = await readDownload(await exportCanvas(page, ["1×"]));
  expect(getCornerAlpha(filled)).toBe(255);

  await chooseFromFileMenu(page, "Export");
  const dialog = page.locator(".canvas-export");
  await dialog
    .getByRole("checkbox", { name: "Transparent background" })
    .check();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const transparent = await readDownload(await downloading);
  expect(getCornerAlpha(transparent)).toBe(0);
});

test("JPEG exports have no transparency", async ({ page }) => {
  await chooseFromFileMenu(page, "Export");
  const dialog = page.locator(".canvas-export");
  const transparent = dialog.getByRole("checkbox", {
    name: "Transparent background",
  });
  await transparent.check();
  await dialog.getByRole("radio", { name: "JPEG" }).check();
  await expect(transparent).toBeDisabled();

  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe("Untitled.jpg");
  // Every JPEG starts with these bytes.
  expect([...(await readDownload(download)).subarray(0, 2)]).toEqual([
    0xff, 0xd8,
  ]);
});

test("SVG exports keep the strokes as shapes", async ({ page }) => {
  await drawLine(page);

  const download = await exportCanvas(page, ["SVG"]);

  expect(download.suggestedFilename()).toBe("Untitled.svg");
  const svg = (await readDownload(download)).toString();
  expect(svg).toMatch(/^<svg /);
  expect(svg).toContain("<path ");
});

test("the export dialog starts from the last choices", async ({ page }) => {
  await exportCanvas(page, ["SVG", "4×"]);

  await page.reload();
  await chooseFromFileMenu(page, "Export");

  const dialog = page.locator(".canvas-export");
  await expect(dialog.getByRole("radio", { name: "SVG" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "4×" })).toBeChecked();
  // Cancelling doesn't export.
  let downloaded = false;
  page.on("download", () => (downloaded = true));
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(downloaded).toBe(false);
});

test("the drawing and settings are restored after a reload", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await drawLine(page);

  await page.reload();

  await expect(page.getByRole("button", { name: "Color: red" })).toBeVisible();
  // Undo history isn't saved.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate(
          (canvas: HTMLCanvasElement) =>
            canvas
              .getContext("2d")!
              .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3]
        )
    )
    .toBeGreaterThan(0);
});

test("clearing can be undone, and stays cleared after a reload", async ({
  page,
}) => {
  const clear = page.getByRole("button", { name: "Clear" });
  const undo = page.getByRole("button", { name: "Undo" });

  await expect(clear).toBeDisabled();

  // The line runs through the middle.
  await drawLine(page);
  await clear.click();
  await expect(clear).toBeDisabled();
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(false);

  await undo.click();
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(true);

  await page.getByRole("button", { name: "Redo" }).click();
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(false);
});

test("every change is kept in the history, to open again", async ({ page }) => {
  await renameCanvas(page, "Sunset");
  await drawLine(page);

  await chooseFromFileMenu(page, "New canvas");
  await expect(page).toHaveTitle("Untitled – Canvas Demo");
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(false);

  await chooseFromFileMenu(page, "Open");
  await page.getByRole("button", { name: "Open Sunset" }).click();

  await expect(page).toHaveTitle("Sunset – Canvas Demo");
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(true);
  // Undo doesn't reach back into another canvas.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a blank canvas joins the history once it's changed", async ({ page }) => {
  // A new canvas would be the same as this one.
  await expect(await getFileMenuItem(page, "New canvas")).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await getHistoryNames(page)).toEqual([]);
  await page.keyboard.press("Escape");

  await drawLine(page);
  expect(await getHistoryNames(page)).toEqual(["Untitled"]);
  await page.keyboard.press("Escape");
  await chooseFromFileMenu(page, "New canvas");
  await expect(await getFileMenuItem(page, "New canvas")).toBeDisabled();
  await page.keyboard.press("Escape");

  // Renaming it is a change too.
  await renameCanvas(page, "Sunset");
  expect(await getHistoryNames(page)).toEqual(["Sunset", "Untitled"]);
});

test("a blank canvas that's left isn't kept", async ({ page }) => {
  await renameCanvas(page, "First");
  await chooseFromFileMenu(page, "New canvas");

  await chooseFromFileMenu(page, "Open");
  await page.getByRole("button", { name: "Open First" }).click();

  expect(await getHistoryNames(page)).toEqual(["First"]);
});

test("editing a canvas moves it to the top of the history", async ({
  page,
}) => {
  await renameCanvas(page, "First");
  await chooseFromFileMenu(page, "New canvas");
  await renameCanvas(page, "Second");
  expect(await getHistoryNames(page)).toEqual(["Second", "First"]);

  await page.getByRole("button", { name: "Open First" }).click();
  // Only opening it isn't an edit.
  expect(await getHistoryNames(page)).toEqual(["Second", "First"]);
  await page.keyboard.press("Escape");
  await drawLine(page);

  expect(await getHistoryNames(page)).toEqual(["First", "Second"]);
});

test("deleting a canvas from the history asks first", async ({ page }) => {
  await renameCanvas(page, "Old");
  await chooseFromFileMenu(page, "Open");

  await page.getByRole("button", { name: "Delete Old" }).click();
  await expect(page.locator(".canvas-history-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm deleting Old" }).click();

  await expect(
    page.getByText("Canvases you draw on show up here.")
  ).toBeVisible();
});

test("deleting the open canvas opens the most recent one", async ({ page }) => {
  await renameCanvas(page, "Old");
  await drawLine(page);
  await chooseFromFileMenu(page, "New canvas");
  await renameCanvas(page, "New");
  await chooseFromFileMenu(page, "Open");

  await page.getByRole("button", { name: "Delete New" }).click();
  await page.getByRole("button", { name: "Confirm deleting New" }).click();

  await expect(page).toHaveTitle("Old – Canvas Demo");
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(true);

  // With none left, it's a blank one.
  await page.getByRole("button", { name: "Delete Old" }).click();
  await page.getByRole("button", { name: "Confirm deleting Old" }).click();
  await expect(page).toHaveTitle("Untitled – Canvas Demo");
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(false);
});

test("the open canvas and the history are restored after a reload", async ({
  page,
}) => {
  await renameCanvas(page, "First");
  await drawLine(page);
  await chooseFromFileMenu(page, "New canvas");
  await renameCanvas(page, "Second");

  await page.reload();

  await expect(page).toHaveTitle("Second – Canvas Demo");
  await chooseFromFileMenu(page, "Open");
  await page.getByRole("button", { name: "Open First" }).click();
  await expect(page).toHaveTitle("First – Canvas Demo");
  await expect.poll(() => isDrawnAt(page, 0.5, 0.5)).toBe(true);

  // A blank canvas reopens blank.
  await chooseFromFileMenu(page, "New canvas");
  await page.reload();
  await expect(page).toHaveTitle("Untitled – Canvas Demo");
  // Opening First didn't edit it.
  expect(await getHistoryNames(page)).toEqual(["Second", "First"]);
});

test("it says when changes can't be saved", async ({ page }) => {
  const status = page.getByText("Couldn't save changes");
  await drawLine(page);
  await expect(status).toBeHidden();

  // As if storage were full.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await drawLine(page);

  await expect(status).toBeVisible();
});

test("renaming asks for the name, saved or cancelled", async ({ page }) => {
  const dialog = page.locator(".canvas-rename");
  const field = page.getByRole("textbox", { name: "Canvas name" });
  // The name isn't shown above the canvas, only where it's asked for.
  await expect(field).toBeHidden();

  await chooseFromFileMenu(page, "Rename");
  // Focused, with the name selected to type over.
  await expect(field).toBeFocused();
  await page.keyboard.type("Sunset");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveTitle("Sunset – Canvas Demo");

  await chooseFromFileMenu(page, "Rename");
  await expect(field).toHaveValue("Sunset");
  await page.keyboard.type("Dawn");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveTitle("Sunset – Canvas Demo");

  // Escape cancels too.
  await chooseFromFileMenu(page, "Rename");
  await page.keyboard.type("Dawn");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveTitle("Sunset – Canvas Demo");
});

test("the tab shows the canvas's name", async ({ page }) => {
  await expect(page).toHaveTitle("Untitled – Canvas Demo");

  await renameCanvas(page, "Sunset");
  await expect(page).toHaveTitle("Sunset – Canvas Demo");

  // It's kept with the canvas.
  await page.reload();
  await expect(page).toHaveTitle("Sunset – Canvas Demo");
});

test("the export is named after the canvas", async ({ page }) => {
  await renameCanvas(page, "Sunset");

  const download = await exportCanvas(page);

  expect(download.suggestedFilename()).toBe("Sunset.png");
});

test("hovering a button shows its name after a moment", async ({ page }) => {
  const tooltip = page.locator(
    '.canvas-toolbar[data-position="bottom"] .canvas-tooltip'
  );
  const undo = page.getByRole("button", { name: "Undo" });
  const pencil = page.getByRole("button", { name: "Pencil" });
  const eraser = page.getByRole("button", { name: "Eraser" });

  await pencil.hover();
  // It waits, rather than flashing up as the pointer passes.
  await expect(tooltip).toBeHidden();
  await expect(tooltip).toHaveText("Pencil");
  await expect(tooltip).toBeVisible();

  // The next one shows straight away.
  await eraser.hover();
  await expect(tooltip).toHaveText("Eraser", { timeout: 200 });

  // Leaving the toolbar hides it.
  await page.mouse.move(5, 5);
  await expect(tooltip).toBeHidden();

  // Pressing a button hides it.
  await undo.hover();
  await expect(tooltip).toHaveText("Undo");
  await expect(tooltip).toBeVisible();
  await page.mouse.down();
  await expect(tooltip).toBeHidden();
});

test("tabbing to a button shows its name", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "Like Safari, WebKit doesn't move focus to buttons with Tab by default."
  );
  const pencil = page.getByRole("button", { name: "Pencil" });
  const eraser = page.getByRole("button", { name: "Eraser" });
  await pencil.focus();

  await page.keyboard.press("Tab");

  await expect(eraser).toBeFocused();
  const tooltip = page.locator(".canvas-tooltip:visible");
  await expect(tooltip).toHaveText("Eraser");
});

test("the file menu opens below its button, lined up with it", async ({
  page,
}) => {
  const file = page.getByRole("button", { name: "File", exact: true });
  await file.click();

  await expect(file).toHaveAttribute("aria-expanded", "true");
  const button = (await file.boundingBox())!;
  const menu = (await page.locator(".canvas-popover").boundingBox())!;
  expect(menu.y).toBeGreaterThan(button.y + button.height);
  // Lined up with the left of the File button's toolbar.
  const toolbar = (await page
    .locator('.canvas-toolbar[data-position="top"]')
    .boundingBox())!;
  expect(menu.x).toBeCloseTo(toolbar.x, 0);

  // Opening the history from it keeps it marked as open.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByText("Canvases you draw on show up here.")
  ).toBeVisible();
  await expect(file).toHaveAttribute("aria-expanded", "true");
});
