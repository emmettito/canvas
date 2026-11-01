import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/full.html");
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

// The light shade notes take of the palette's `color`, as its swatch in the
// note's options shows it. The note tool must be picked.
function getShade(page: Page, color: string) {
  return page
    .getByRole("toolbar", { name: "Sticky note options" })
    .getByRole("button", { name: color, exact: true })
    .locator(".canvas-swatch-dot")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}

function getNotes(page: Page) {
  return page.getByRole("textbox", { name: "Sticky note" });
}

// The first note's color, as "#rrggbb", the way the dropper and exports write
// it.
function getNoteHex(page: Page) {
  return page
    .locator(".canvas-note")
    .first()
    .evaluate((element) => {
      const [r, g, b] = getComputedStyle(element)
        .backgroundColor.match(/\d+/g)!
        .map(Number);
      return `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
    });
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

test("the text tool types in a note, rather than adding text over it", async ({
  page,
}) => {
  await addNote(page, "Hello");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await getNotes(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" there");
  await page.keyboard.press("Escape");

  await expect(getNotes(page)).toHaveText("Hello there");
  await expect(page.locator(".canvas-text")).toHaveCount(0);
});

test("a note left empty is kept", async ({ page }) => {
  await addNote(page, "");

  await expect(getNotes(page)).toHaveCount(1);
  await expect(getNotes(page)).toHaveText("");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
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

test("clicking the canvas adds a note of the usual size, centered there", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const canvas = (await page.locator("canvas").boundingBox())!;
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.click(x, y);

  const note = (await page.locator(".canvas-note").boundingBox())!;
  expect(note.width).toBeCloseTo(160, 0);
  expect(note.height).toBeCloseTo(160, 0);
  expect(note.x + note.width / 2).toBeCloseTo(x, 0);
  await expect(getNotes(page)).toBeFocused();
});

test("dragging on the canvas sizes a new note, in any direction", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const canvas = (await page.locator("canvas").boundingBox())!;
  const start = {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + canvas.height / 2,
  };
  await drag(page, start, -240, 90);

  const note = (await page.locator(".canvas-note").boundingBox())!;
  expect(note.width).toBeCloseTo(240, 0);
  expect(note.height).toBeCloseTo(90, 0);
  // Its right side is where the drag started.
  expect(note.x + note.width).toBeCloseTo(start.x, 0);
  expect(note.y).toBeCloseTo(start.y, 0);
  // It's opened for typing, and added once typing stops.
  await expect(getNotes(page)).toBeFocused();
  await page.keyboard.type("Wide");
  await page.keyboard.press("Escape");
  await expect(getNotes(page)).toHaveText("Wide");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getNotes(page)).toHaveCount(0);
});

test("a note dragged smaller than it can be is its smallest size", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const canvas = (await page.locator("canvas").boundingBox())!;
  await drag(page, { x: canvas.x + 200, y: canvas.y + 200 }, 10, 10);

  const note = (await page.locator(".canvas-note").boundingBox())!;
  expect(note.width).toBeCloseTo(48, 0);
  expect(note.height).toBeCloseTo(48, 0);
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

test("a note dragged near another lines up with it, unless Alt is held", async ({
  page,
}) => {
  await addNote(page, "First", 0.3, 0.3);
  await addNote(page, "Second", 0.6, 0.8);
  const [first, second] = await page.locator(".canvas-note").all();
  const target = (await first.boundingBox())!;
  const start = (await second.boundingBox())!;
  // Its left side ends up 3 pixels right of the first's.
  const dx = target.x - start.x + 3;

  await page.mouse.move(start.x + 20, start.y + 20);
  await page.mouse.down();
  await page.mouse.move(start.x + 20 + dx, start.y + 20, { steps: 5 });
  await expect(page.locator(".canvas-snap-guide").first()).toBeVisible();
  await page.mouse.up();

  expect((await second.boundingBox())!.x).toBeCloseTo(target.x, 0);
  await expect(page.locator(".canvas-snap-guide")).toHaveCount(0);

  const lined = (await second.boundingBox())!;
  // Past the drag threshold and back, ending 3 pixels to the right.
  await page.keyboard.down("Alt");
  await page.mouse.move(lined.x + 20, lined.y + 20);
  await page.mouse.down();
  await page.mouse.move(lined.x + 60, lined.y + 20, { steps: 5 });
  await page.mouse.move(lined.x + 23, lined.y + 20, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  expect((await second.boundingBox())!.x).toBeCloseTo(target.x + 3, 0);
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

test("with the note tool, clicking a note opens it for typing", async ({
  page,
}) => {
  await addNote(page, "Hello");

  await page.locator(".canvas-note").click();
  await page.keyboard.type(" there");
  await page.keyboard.press("Escape");

  await expect(getNotes(page)).toHaveText("Hello there");
});

test("with the move tool, clicking a note picks it, and double-clicking opens it", async ({
  page,
}) => {
  await addNote(page, "Hello");
  await page.getByRole("button", { name: "Move" }).click();
  const note = page.locator(".canvas-note");

  await note.dblclick();
  await page.keyboard.type(" there");
  await page.keyboard.press("Escape");
  await expect(getNotes(page)).toHaveText("Hello there");

  await note.click();
  await expect(note).toBeFocused();
  await expect(note).not.toHaveAttribute("data-editing");
});

test("emptying a note keeps it, and deleting it from its menu removes it", async ({
  page,
}) => {
  await addNote(page, "One");

  await page.locator(".canvas-note").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(getNotes(page)).toHaveCount(1);
  await expect(getNotes(page)).toHaveText("");

  await page.locator(".canvas-note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(getNotes(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getNotes(page)).toHaveCount(1);
});

test("notes take a light shade of the chosen color", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await expect(
    page.getByRole("button", { name: "Color: Yellow", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Color: Yellow", exact: true })
    .click();
  await page
    .locator(".canvas-popover")
    .getByRole("button", { name: "Blue", exact: true })
    .click();
  // The note tool stays chosen.
  await expect(
    page.getByRole("button", { name: "Sticky note" })
  ).toHaveAttribute("aria-pressed", "true");

  await addNote(page, "Blue");

  const shade = await getShade(page, "Blue");
  // Lighter than the palette's #2c71ff.
  expect(shade).not.toBe("rgb(44, 113, 255)");
  await expect(page.locator(".canvas-note")).toHaveCSS(
    "background-color",
    shade
  );
});

test("the note's options offer light shades, and a custom color as it is", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const options = page.getByRole("toolbar", { name: "Sticky note options" });
  const blue = options.getByRole("button", { name: "Blue", exact: true });
  // The shade a note in it would be, lighter than the palette's #2c71ff.
  const shade = await getShade(page, "Blue");
  expect(shade).not.toBe("rgb(44, 113, 255)");
  await blue.click();
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await addNote(page, "Blue");
  await expect(page.locator(".canvas-note")).toHaveCSS(
    "background-color",
    shade
  );

  // A color from the picker isn't made lighter.
  await options.getByRole("button", { name: /^Custom color: / }).click();
  const code = page.getByRole("textbox", { name: "Color code" });
  await code.fill("#2c71ff");
  await code.press("Enter");
  await page.keyboard.press("Escape");
  await addNote(page, "Bright", 0.2, 0.3);
  await expect(page.locator(".canvas-note").last()).toHaveCSS(
    "background-color",
    "rgb(44, 113, 255)"
  );
});

test("the note's options keep their shades after a reload", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const shade = await getShade(page, "Blue");
  // The note tool is still picked, so its options are made as the page loads.
  await page.reload();
  await expect(
    page.getByRole("toolbar", { name: "Sticky note options" })
  ).toBeVisible();
  expect(await getShade(page, "Blue")).toBe(shade);
});

test("picking a color in the note's options while typing in it recolors it, and is undone", async ({
  page,
}) => {
  await addNote(page, "Hello");
  const note = page.locator(".canvas-note");
  const yellow = await note.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

  await note.click();
  await page
    .getByRole("toolbar", { name: "Sticky note options" })
    .getByRole("button", { name: "Green", exact: true })
    .click();
  await expect(note).not.toHaveCSS("background-color", yellow);
  const green = await note.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  // Typing goes on.
  await expect(note).toHaveAttribute("data-editing");
  await page.keyboard.press("Escape");

  // One undo takes it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(note).toHaveCSS("background-color", yellow);
  await expect(getNotes(page)).toHaveText("Hello");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(note).toHaveCSS("background-color", green);
});

test("a note recolored while typing in it keeps what's typed after", async ({
  page,
}) => {
  await addNote(page, "Hello");
  const note = page.locator(".canvas-note");

  await note.click();
  await page
    .getByRole("toolbar", { name: "Sticky note options" })
    .getByRole("button", { name: "Green", exact: true })
    .click();
  await page.keyboard.type(" there");
  await page.keyboard.press("Escape");

  await expect(getNotes(page)).toHaveText("Hello there");
  const green = await getShade(page, "Green");
  await page.reload();
  await expect(getNotes(page)).toHaveText("Hello there");
  await expect(note).toHaveCSS("background-color", green);
});

test("the note tool shows where a note would go, under the mouse", async ({
  page,
}) => {
  const ghost = page.locator(".canvas-note-ghost");
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.move(500, 300);
  await page.mouse.move(520, 320);

  await expect(ghost).toBeVisible();
  const box = (await ghost.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(520, 0);
  expect(box.y + box.height / 2).toBeCloseTo(320, 0);

  // Not while typing in the note placed there.
  await page.mouse.click(520, 320);
  await page.mouse.move(540, 340);
  await expect(ghost).toBeHidden();
  await page.keyboard.press("Escape");

  // Nor with another tool.
  await page.getByRole("button", { name: "Pencil" }).click();
  await page.mouse.move(300, 200);
  await expect(ghost).toBeHidden();
});

test("an empty note being typed in shows a hint", async ({ page }) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(500, 300);

  const note = page.locator(".canvas-note");
  await expect(note).toHaveAttribute("data-empty");
  expect(
    await note.evaluate(
      (element) => getComputedStyle(element, "::before").content
    )
  ).toBe('"Add text"');
  await page.keyboard.type("Hi");
  await expect(note).not.toHaveAttribute("data-empty");
});

test("a space hides a note's hint, but only spaces aren't kept", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(500, 300);
  const note = page.locator(".canvas-note");

  await page.keyboard.type("  ");
  await expect(note).not.toHaveAttribute("data-empty");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  // It's kept empty, with its hint, even once it's no longer typed in.
  await expect(note).toHaveAttribute("data-empty");
  await expect(getNotes(page)).toHaveText("");
  await page.reload();
  await expect(page.locator(".canvas-note")).toHaveAttribute("data-empty");
});

test("right-clicking a note being typed in opens its menu, and keeps the text", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.type("Typing");

  await getNotes(page).click({ button: "right" });
  const menu = page.locator(".canvas-context-menu");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(getNotes(page)).toHaveText("Typing");
});

test("notes are restored after a reload", async ({ page }) => {
  await addNote(page, "Remember me");

  await page.reload();

  await expect(getNotes(page)).toHaveText("Remember me");
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
  expect(svg).toContain(`fill="${await getNoteHex(page)}"`);
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
