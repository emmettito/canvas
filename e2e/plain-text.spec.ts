import { expect, type Page, test } from "@playwright/test";

// The canvas without a text editor plugin, which edits plain text.
test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/plain-text.html");
  await expect(page.locator("canvas")).toBeVisible();
});

async function place(page: Page, tool: string, text: string) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

test("notes are typed in as plain text, without a format bar", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Plain\nnote");

  await expect(
    page.getByRole("toolbar", { name: "Text formatting" })
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Sticky note" })).toHaveValue(
    "Plain\nnote"
  );

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("textbox", { name: "Sticky note" })).toHaveCount(
    0
  );
});

test("text fits its longest line, and opens again for typing", async ({
  page,
}) => {
  await place(page, "Text", "Short");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await text.click();
  await page.keyboard.type(" and much longer");
  await page.keyboard.press("Escape");

  expect((await text.boundingBox())!.width).toBeGreaterThan(before.width * 2);
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue(
    "Short and much longer"
  );
});

test("dragging text's side wraps it", async ({ page }) => {
  await place(page, "Text", "A long line of text that wraps");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;
  const side = (await page
    .locator('.canvas-text-resize[data-handle="e"]')
    .boundingBox())!;

  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    side.x + side.width / 2 - before.width / 2,
    side.y + side.height / 2,
    { steps: 5 }
  );
  await page.mouse.up();

  const after = (await text.boundingBox())!;
  expect(after.height).toBeGreaterThan(before.height * 1.5);
});
