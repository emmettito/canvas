import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Adds a note at a fraction of the canvas's width and height, and types in it.
async function addNote(page: Page, text: string, x = 0.5, y = 0.5) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.keyboard.type(text);
  // Typing ends when the note loses focus.
  await page.keyboard.press("Escape");
}

function getNotes(page: Page) {
  return page.getByRole("textbox", { name: "Sticky note" });
}

// Drags from `from` by `dx` and `dy` pixels.
async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up();
}

test("a note can be added, typed in, and undone", async ({ page }) => {
  await addNote(page, "Buy milk");

  await expect(getNotes(page)).toHaveCount(1);
  await expect(getNotes(page)).toHaveText("Buy milk");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getNotes(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(getNotes(page)).toHaveText("Buy milk");
});

test("a note left empty isn't kept", async ({ page }) => {
  await addNote(page, "");

  await expect(getNotes(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("clicking the canvas to stop typing doesn't add another note", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.keyboard.type("First");
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5);

  await expect(getNotes(page)).toHaveCount(1);
});

test("dragging a note moves it, and the move can be undone", async ({
  page,
}) => {
  await addNote(page, "Move me");
  const note = page.locator(".canvas-note");
  const before = (await note.boundingBox())!;

  await drag(page, { x: before.x + 20, y: before.y + 20 }, 60, 40);

  const after = (await note.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(60, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);
  // Dragging doesn't open it for typing.
  await expect(getNotes(page)).not.toBeFocused();

  await page.getByRole("button", { name: "Undo" }).click();
  const undone = (await note.boundingBox())!;
  expect(undone.x).toBeCloseTo(before.x, 0);
});

// The middle of one of a note's invisible resize handles, e.g. "se" for its
// bottom right corner.
async function getHandle(page: Page, handle: string) {
  const box = (await page
    .locator(`.canvas-note-resize[data-handle="${handle}"]`)
    .boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("dragging a note's corner resizes it", async ({ page }) => {
  await addNote(page, "Resize me");
  const note = page.locator(".canvas-note");
  const before = (await note.boundingBox())!;

  await drag(page, await getHandle(page, "se"), 50, 30);

  const after = (await note.boundingBox())!;
  expect(after.width - before.width).toBeCloseTo(50, 0);
  expect(after.height - before.height).toBeCloseTo(30, 0);
  expect(after.x).toBeCloseTo(before.x, 0);
});

test("dragging a note's left side resizes it, keeping its right side", async ({
  page,
}) => {
  await addNote(page, "Resize me");
  const note = page.locator(".canvas-note");
  const before = (await note.boundingBox())!;

  await drag(page, await getHandle(page, "w"), -40, 25);

  const after = (await note.boundingBox())!;
  expect(after.width - before.width).toBeCloseTo(40, 0);
  expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0);
  // Only the side moves, not the top or bottom.
  expect(after.height).toBeCloseTo(before.height, 0);
});

test("the resize handles can't be seen, but the pointer shows them", async ({
  page,
}) => {
  await addNote(page, "Handles");
  const corner = page.locator('.canvas-note-resize[data-handle="se"]');
  const side = page.locator('.canvas-note-resize[data-handle="n"]');

  await expect(corner).toHaveCSS("cursor", "nwse-resize");
  await expect(side).toHaveCSS("cursor", "ns-resize");
  await expect(corner).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("clicking a note opens it for typing", async ({ page }) => {
  await addNote(page, "Hello");
  await page.getByRole("button", { name: "Pencil" }).click();

  await page.locator(".canvas-note").click();
  await page.keyboard.type(" there");
  await page.keyboard.press("Escape");

  await expect(getNotes(page)).toHaveText("Hello there");
});

test("emptying a note or deleting it from its menu removes it", async ({
  page,
}) => {
  await addNote(page, "One", 0.3);
  await addNote(page, "Two", 0.7);

  await page.locator(".canvas-note").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(getNotes(page)).toHaveCount(1);

  await page.locator(".canvas-note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(getNotes(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getNotes(page)).toHaveText("Two");
});

test("notes take a light shade of the chosen color", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await expect(
    page.getByRole("button", { name: "Color: yellow" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Color: yellow" }).click();
  await page.getByRole("button", { name: "blue", exact: true }).click();
  // The note tool stays chosen.
  await expect(
    page.getByRole("button", { name: "Sticky note" })
  ).toHaveAttribute("aria-pressed", "true");

  await addNote(page, "Blue");

  // 40% of #2c71ff, and the rest white.
  await expect(page.locator(".canvas-note")).toHaveCSS(
    "background-color",
    "rgb(171, 198, 255)"
  );
});

test("notes are restored after a reload", async ({ page }) => {
  await addNote(page, "Remember me");

  await page.reload();

  await expect(getNotes(page)).toHaveText("Remember me");
});

test("clearing removes notes", async ({ page }) => {
  await addNote(page, "Gone");

  await page.getByRole("button", { name: "Clear" }).click();

  await expect(getNotes(page)).toHaveCount(0);
});

test("SVG exports include notes and their text", async ({ page }) => {
  await addNote(page, "Exported");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const svg = (await readFile(await (await download).path())).toString();
  expect(svg).toContain('fill="#fefe99"');
  expect(svg).toContain(">Exported</tspan>");
});

test("a focused note is deleted with Delete, and opened with Enter", async ({
  page,
}) => {
  await addNote(page, "Keys");
  // Escape leaves focus on the note.
  await expect(page.locator(".canvas-note")).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.type("!");
  await page.keyboard.press("Escape");
  await expect(getNotes(page)).toHaveText("Keys!");

  await page.keyboard.press("Delete");
  await expect(getNotes(page)).toHaveCount(0);
});
