import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// A 200 by 100 PNG, half red and half blue, made in the page.
async function createPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = "#0000ff";
    context.fillRect(100, 0, 100, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

// Inserts the PNG with the toolbar's button.
async function insertImage(page: Page, png: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert image" }).click();
  await (
    await chooser
  ).setFiles({
    name: "picture.png",
    mimeType: "image/png",
    buffer: png,
  });
}

function getImages(page: Page) {
  return page.getByRole("img", { name: "Image" });
}

test("an image can be inserted from a file, and undone", async ({ page }) => {
  await insertImage(page, await createPng(page));

  const image = getImages(page);
  await expect(image).toHaveCount(1);
  // It's at its own size, in the middle of the canvas, since it fits.
  const box = (await image.boundingBox())!;
  const canvas = (await page.locator("canvas").boundingBox())!;
  expect(box.width).toBeCloseTo(200, 0);
  expect(box.height).toBeCloseTo(100, 0);
  expect(box.x + box.width / 2).toBeCloseTo(canvas.x + canvas.width / 2, 0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getImages(page)).toHaveCount(0);
});

test("a dropped image is placed where it's dropped", async ({ page }) => {
  const png = await createPng(page);
  const canvas = (await page.locator("canvas").boundingBox())!;
  const point = { x: canvas.x + 300, y: canvas.y + 200 };

  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "picture.png", { type: "image/png" })
      );
      return transfer;
    },
    [...png]
  );
  const init = { dataTransfer, clientX: point.x, clientY: point.y };
  await page.dispatchEvent(".canvas-wrapper", "dragover", init);
  await page.dispatchEvent(".canvas-wrapper", "drop", init);

  const box = (await getImages(page).boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(point.x, 0);
  expect(box.y + box.height / 2).toBeCloseTo(point.y, 0);
});

test("a pasted image is placed under the pointer", async ({
  page,
  browserName,
}) => {
  // Only Chromium lets a page make a paste event with files in it.
  test.skip(browserName !== "chromium");
  const png = await createPng(page);
  const canvas = (await page.locator("canvas").boundingBox())!;
  const point = { x: canvas.x + 400, y: canvas.y + 250 };
  await page.mouse.move(point.x, point.y);

  await page.evaluate(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "picture.png", { type: "image/png" })
      );
      document.body.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true })
      );
    },
    [...png]
  );

  const box = (await getImages(page).boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(point.x, 0);
});

test("dragging an image's corner resizes it, keeping its shape", async ({
  page,
}) => {
  await insertImage(page, await createPng(page));
  const image = getImages(page);
  const before = (await image.boundingBox())!;
  const corner = (await page
    .locator('.canvas-image-resize[data-handle="nw"]')
    .boundingBox())!;
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 100, y, { steps: 5 });
  await page.mouse.up();

  const box = (await image.boundingBox())!;
  expect(box.width).toBeCloseTo(300, 0);
  expect(box.height).toBeCloseTo(150, 0);
  // The opposite corner stays where it was.
  expect(box.x + box.width).toBeCloseTo(before.x + before.width, 0);
  expect(box.y + box.height).toBeCloseTo(before.y + before.height, 0);
});

test("a focused image is deleted with Delete, or from its menu", async ({
  page,
}) => {
  await insertImage(page, await createPng(page));
  await getImages(page).click();
  await page.keyboard.press("Delete");
  await expect(getImages(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await getImages(page).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(getImages(page)).toHaveCount(0);
});

test("images are kept after a reload, and exported unchanged", async ({
  page,
}) => {
  const png = await createPng(page);
  await insertImage(page, png);
  // Saving the file finishes after it's shown.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const request = indexedDB.open("canvas:images");
            request.onsuccess = () => {
              const count = request.result
                .transaction("images")
                .objectStore("images")
                .count();
              count.onsuccess = () => resolve(count.result);
            };
          })
      )
    )
    .toBe(1);

  await page.reload();

  // The file comes back from IndexedDB.
  const file = page.locator(".canvas-image-file");
  await expect
    .poll(() => file.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(200);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const svg = (await readFile(await (await download).path())).toString();
  // The very same bytes, so nothing was lost.
  expect(svg).toContain(
    `href="data:image/png;base64,${png.toString("base64")}"`
  );
});

test("PNG exports include images", async ({ page }) => {
  await insertImage(page, await createPng(page));

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "1×" }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const bytes = await readFile(await (await download).path());

  // The pixel just left of the middle is the image's red half.
  const color = await page.evaluate(
    async (data) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(data)], { type: "image/png" })
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return [
        ...context.getImageData(bitmap.width / 2 - 50, bitmap.height / 2, 1, 1)
          .data,
      ];
    },
    [...bytes]
  );
  expect(color).toEqual([255, 0, 0, 255]);
});
