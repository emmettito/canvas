import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
});

// Adds a note centered at `x`, `y` on screen, then goes back to the pencil.
async function addNote(page: Page, x = 500, y = 300) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(x, y);
  await page.keyboard.type("Note");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pencil" }).click();
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

// The alpha drawn on a note's own canvas at `x`, `y` on screen.
function getInkAt(page: Page, x: number, y: number) {
  return page.locator(".canvas-note-ink").evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const box = canvas.getBoundingClientRect();
      return canvas
        .getContext("2d")!
        .getImageData(
          Math.floor(((x - box.left) * canvas.width) / box.width),
          Math.floor(((y - box.top) * canvas.height) / box.height),
          1,
          1
        ).data[3];
    },
    [x, y]
  );
}

// Picks the color at `x`, `y` with the dropper, as it's drawn, and gives
// the pencil's color after.
async function pickColor(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(x, y);
  return page
    .getByRole("button", { name: /^Color: / })
    .getAttribute("aria-label");
}

test("drawing on a note draws on it, and moves with it", async ({ page }) => {
  await addNote(page);
  await drag(page, { x: 470, y: 320 }, 60, 0);

  // It's the note's, not the drawing's.
  await expect(page.locator(".canvas-note-ink")).toHaveCount(1);
  expect(await getInkAt(page, 500, 320)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Move" }).click();
  await drag(page, { x: 450, y: 260 }, 100, 50);
  expect(await getInkAt(page, 600, 370)).toBeGreaterThan(0);

  // Undoing the move, then the stroke, leaves the note as it was.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await getInkAt(page, 500, 320)).toBe(0);
});

test("a note's strokes stay put as it's resized, and only show inside it", async ({
  page,
}) => {
  await addNote(page);
  // A dot near the note's right edge.
  await page.mouse.click(560, 300);
  await page.getByRole("button", { name: "Move" }).click();
  const note = page.locator(".canvas-note");
  const before = (await note.boundingBox())!;

  // Wider from the left: the dot stays where it is on screen.
  await drag(page, { x: before.x, y: before.y + 80 }, -60, 0);
  expect((await note.boundingBox())!.width).toBeCloseTo(before.width + 60, 0);
  expect(await getInkAt(page, 560, 300)).toBeGreaterThan(0);

  // Narrower from the right, past the dot, which is hidden rather than
  // squashed.
  const after = (await note.boundingBox())!;
  await drag(page, { x: after.x + after.width, y: after.y + 80 }, -50, 0);
  await page.getByRole("button", { name: "Pencil" }).click();
  expect(await pickColor(page, 560, 300)).toBe("Color: white");
});

test("a stroke drawn after an image is above it, and one before below", async ({
  page,
}) => {
  // A blue line, then a note over it, then a red line over both.
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "blue", exact: true }).click();
  await drag(page, { x: 300, y: 300 }, 400, 0);
  await addNote(page, 500, 300);
  await page.getByRole("button", { name: "Color: blue" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  // Started off the note, so it's on the drawing, over it.
  await drag(page, { x: 500, y: 150 }, 0, 300);

  const note = page.locator(".canvas-note");
  const drawings = page.locator(".canvas-drawing");
  await expect(drawings).toHaveCount(2);
  const zIndex = (locator: typeof note) =>
    locator.evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(await zIndex(drawings.first())).toBeLessThan(await zIndex(note));
  expect(await zIndex(drawings.last())).toBeGreaterThan(await zIndex(note));
  // Strokes can't be added below the note, so that canvas is only as big as
  // the blue line, and the one on top covers the window.
  const below = (await drawings.first().boundingBox())!;
  expect(below.width).toBeLessThan(450);
  expect(below.height).toBeLessThan(50);
  expect((await drawings.last().boundingBox())!.width).toBe(
    page.viewportSize()!.width
  );

  // The note hides the blue line, and the red one shows over the note.
  expect(await pickColor(page, 460, 300)).toBe("Color: #fefe99");
  expect(await pickColor(page, 500, 260)).toBe("Color: red");
  // Off the note, the blue line shows.
  expect(await pickColor(page, 320, 300)).toBe("Color: blue");
});

test("an item's menu brings it to the front or sends it to the back", async ({
  page,
}) => {
  await addNote(page, 500, 300);
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await drag(page, { x: 500, y: 150 }, 0, 300);
  expect(await pickColor(page, 500, 300)).toBe("Color: red");

  // A right-click with the pencil opens the note's menu too.
  await page.mouse.click(460, 340, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Send to back" })
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Bring to front" }).click();
  expect(await pickColor(page, 500, 300)).toBe("Color: #fefe99");

  // It's kept, and undone.
  await page.reload();
  expect(await pickColor(page, 500, 300)).toBe("Color: #fefe99");
  await page.getByRole("button", { name: "Pencil" }).click();
  await page.mouse.click(460, 340, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Bring to front" })
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Send to back" }).click();
  expect(await pickColor(page, 500, 300)).toBe("Color: red");
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await pickColor(page, 500, 300)).toBe("Color: #fefe99");
});

test("the pencil draws over items, and the move tool moves them", async ({
  page,
}) => {
  await addNote(page);
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "blue", exact: true }).click();
  const note = page.locator(".canvas-note");
  const before = (await note.boundingBox())!;
  await drag(page, { x: 300, y: 200 }, 400, 200);
  expect((await note.boundingBox())!.x).toBe(before.x);

  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "Move" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await drag(page, { x: before.x + 20, y: before.y + 20 }, 40, 30);
  const after = (await note.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x + 40, 0);
  expect(after.y).toBeCloseTo(before.y + 30, 0);
});

test("the move tool pans from anywhere but an item, and leaves its pick", async ({
  page,
}) => {
  await addNote(page);
  await page.keyboard.press("v");
  const note = page.locator(".canvas-note");
  await note.click();
  await expect(note).toBeFocused();
  const before = (await note.boundingBox())!;

  await drag(page, { x: 200, y: 200 }, -50, 40);

  const after = (await note.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x - 50, 0);
  expect(after.y).toBeCloseTo(before.y + 40, 0);
  await expect(note).not.toBeFocused();
  // Panning drew nothing.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(note).toHaveCount(0);
});

test("tools' keys pick them, but not while typing", async ({ page }) => {
  await page.keyboard.press("t");
  await expect(
    page.getByRole("button", { name: "Text", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(400, 300);
  await page.keyboard.type("pen");

  await expect(page.locator(".canvas-text")).toHaveText("pen");
  await expect(
    page.getByRole("button", { name: "Text", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Eraser" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("an inserted image is picked with the move tool", async ({ page }) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insert image" }).click();
  await (
    await chooser
  ).setFiles({
    name: "dot.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });

  await expect(page.getByRole("button", { name: "Move" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("img", { name: "Image" })).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("img", { name: "Image" })).toHaveCount(0);
});
