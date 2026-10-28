import { expect, type Page, test } from "@playwright/test";

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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

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

  // Safari doesn't focus buttons on click, so this checks the fallback there.
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
