import { type Browser, expect, type Page, test } from "@playwright/test";

type Box = Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>;

const PAGE = "/e2e/fixtures/full.html";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(PAGE);
  await expect(page.locator(".canvas-drawing")).toBeVisible();
});

interface SavedStroke {
  id: string;
  size: number;
  points: { x: number; y: number }[];
}

// What's saved under the part of a canvas, e.g. its strokes.
function readSaved(page: Page, part: string): Promise<SavedStroke[]> {
  return page.evaluate(
    (key) =>
      Object.entries(localStorage)
        .filter(([each]) => each.endsWith(`:${key}`))
        .flatMap(([, value]) => JSON.parse(value)),
    part
  );
}

// Waits for `count` saved strokes, and gives them.
async function getStrokes(page: Page, count: number): Promise<SavedStroke[]> {
  await expect
    .poll(async () => (await readSaved(page, "strokes")).length)
    .toBe(count);
  return readSaved(page, "strokes");
}

async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  modifiers: string[] = []
) {
  for (const key of modifiers) {
    await page.keyboard.down(key);
  }
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
  for (const key of modifiers) {
    await page.keyboard.up(key);
  }
}

async function pick(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

const outlines = (page: Page) => page.locator(".canvas-stroke-box");

// Clicks a note, then, long enough after not to be a double-click, its ink.
async function pickInk(page: Page, x: number, y: number) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(450);
  await page.mouse.click(x, y);
}

// A line across the canvas, then the select tool.
async function drawLine(page: Page, y = 300) {
  await pick(page, "Pencil");
  await drag(page, [300, y], [700, y]);
  await pick(page, "Select");
}

test("the eraser cuts a stroke in two, and each piece moves on its own", async ({
  page,
}) => {
  await drawLine(page);
  await pick(page, "Eraser");
  await drag(page, [500, 250], [500, 350]);

  const [left, right] = await getStrokes(page, 2);
  expect(left.id).not.toBe(right.id);
  expect(await readSaved(page, "erasers")).toEqual([]);

  await pick(page, "Select");
  await page.mouse.click(350, 300);
  await expect(outlines(page)).toHaveCount(1);
  await drag(page, [350, 300], [350, 400]);

  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].points[0].y)
    .toBeCloseTo(left.points[0].y + 100, 0);
  const [moved, stayed] = await readSaved(page, "strokes");
  expect(stayed.points[0].y).toBe(right.points[0].y);
  // What was erased stays erased, wherever it's moved.
  expect(moved.points.at(-1)!.x).toBeLessThan(500);
});

test("clicking a stroke picks it, and dragging moves it, which undoes", async ({
  page,
}) => {
  await drawLine(page);
  const [before] = await getStrokes(page, 1);

  await drag(page, [500, 300], [550, 360]);
  await expect(outlines(page)).toHaveCount(1);
  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].points[0].y)
    .toBeCloseTo(before.points[0].y + 60, 0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].points[0].y)
    .toBeCloseTo(before.points[0].y, 0);
});

test("clicking away, or Escape, picks nothing, and it isn't picked off it", async ({
  page,
}) => {
  await drawLine(page);
  await page.mouse.click(500, 500);
  await expect(outlines(page)).toHaveCount(0);

  await page.mouse.click(500, 300);
  await expect(outlines(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(outlines(page)).toHaveCount(0);
});

test("a box picks the strokes it touches, and Delete deletes them", async ({
  page,
}) => {
  await pick(page, "Pencil");
  await drag(page, [300, 200], [700, 200]);
  await drag(page, [300, 500], [700, 500]);
  await pick(page, "Select");
  await getStrokes(page, 2);

  await drag(page, [450, 150], [550, 250]);
  await expect(outlines(page)).toHaveCount(1);

  await page.keyboard.press("Delete");
  await getStrokes(page, 1);
  await expect(outlines(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await getStrokes(page, 2);
});

test("Ctrl+A picks strokes along with items, which move together", async ({
  page,
}) => {
  await drawLine(page);
  await pick(page, "Sticky note");
  await page.mouse.click(500, 500);
  await page.keyboard.type("A");
  await page.keyboard.press("Escape");
  await pick(page, "Select");
  const note = page.locator(".canvas-note");
  const box = (await note.boundingBox())!;
  const [before] = await getStrokes(page, 1);

  await page.keyboard.press("ControlOrMeta+a");
  await expect(outlines(page)).toHaveCount(1);
  await drag(page, [500, 300], [560, 300]);

  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].points[0].x)
    .toBeCloseTo(before.points[0].x + 60, 0);
  expect((await note.boundingBox())!.x).toBeCloseTo(box.x + 60, 0);

  // And undo together, as one change.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].points[0].x)
    .toBeCloseTo(before.points[0].x, 0);
  expect((await note.boundingBox())!.x).toBeCloseTo(box.x, 0);
});

test("copying a stroke pastes it a little further on, picked", async ({
  page,
}) => {
  await drawLine(page);
  await page.mouse.click(500, 300);

  await page.keyboard.press("ControlOrMeta+d");

  const [first, copy] = await getStrokes(page, 2);
  expect(copy.id).not.toBe(first.id);
  expect(copy.points[0].x).toBeGreaterThan(first.points[0].x);
  await expect(outlines(page)).toHaveCount(1);
});

test("a stroke's corner resizes it, with its line", async ({ page }) => {
  await drawLine(page);
  const [before] = await getStrokes(page, 1);
  await page.mouse.click(500, 300);
  const outline = (await outlines(page).boundingBox())!;

  await drag(
    page,
    [outline.x + outline.width, outline.y + outline.height],
    [outline.x + outline.width + 200, outline.y + outline.height + 100]
  );

  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].size)
    .toBeGreaterThan(before.size);
  const [after] = await readSaved(page, "strokes");
  // The corner across from the one dragged stays where it was.
  expect(Math.abs(after.points[0].x - before.points[0].x)).toBeLessThan(5);
  expect(after.points.at(-1)!.x).toBeGreaterThan(before.points.at(-1)!.x + 150);
  // Only one picked resizes.
  await expect(page.locator(".canvas-stroke-resize")).toHaveCount(8);
});

test("a stroke's menu brings it to the front and sends it to the back", async ({
  page,
}) => {
  await pick(page, "Pencil");
  await drag(page, [300, 200], [700, 200]);
  await drag(page, [300, 500], [700, 500]);
  await pick(page, "Select");
  const [first, second] = await getStrokes(page, 2);

  await page.mouse.click(500, 200, { button: "right" });
  await page.getByRole("menuitem", { name: "Bring to front" }).click();
  await expect
    .poll(async () => (await readSaved(page, "strokes"))[1].id)
    .toBe(first.id);

  await page.mouse.click(500, 200, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Bring to front" })
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Send to back" }).click();
  await expect
    .poll(async () => (await readSaved(page, "strokes"))[0].id)
    .toBe(first.id);
  expect((await readSaved(page, "strokes"))[1].id).toBe(second.id);

  await page.mouse.click(500, 500, { button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await getStrokes(page, 1);
});

test("a stroke on a note can be picked, moved and deleted, and the note stays", async ({
  page,
}) => {
  await pick(page, "Sticky note");
  await page.keyboard.down("Alt");
  await page.mouse.click(500, 300);
  await page.keyboard.up("Alt");
  await page.keyboard.press("Escape");
  const note = page.locator(".canvas-note");
  const box = (await note.boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await pick(page, "Pencil");
  await drag(page, [middle.x - 30, middle.y], [middle.x + 30, middle.y]);
  await pick(page, "Select");

  await pickInk(page, middle.x, middle.y);
  await drag(page, [middle.x, middle.y], [middle.x, middle.y + 20]);
  await expect(outlines(page)).toHaveCount(1);
  expect(await note.boundingBox()).toEqual(box);
  const y = () =>
    readSaved(page, "notes").then(
      (notes) =>
        (notes[0] as unknown as { strokes: SavedStroke[] }).strokes[0].points[0]
          .y
    );
  await expect.poll(y).toBeCloseTo(box.height / 2 + 20, 0);

  await page.keyboard.press("Delete");
  await expect
    .poll(() =>
      readSaved(page, "notes").then(
        (notes) =>
          (notes[0] as unknown as { strokes: SavedStroke[] }).strokes.length
      )
    )
    .toBe(0);
  await expect(note).toHaveCount(1);
});

test.describe("dropping a stroke", () => {
  // A note, and a short stroke to the left of it, and its box.
  async function addNoteAndStroke(page: Page) {
    await pick(page, "Sticky note");
    await page.keyboard.down("Alt");
    await page.mouse.click(600, 300);
    await page.keyboard.up("Alt");
    await page.keyboard.press("Escape");
    await pick(page, "Pencil");
    await drag(page, [200, 300], [240, 300]);
    await pick(page, "Select");
    await getStrokes(page, 1);
    return (await page.locator(".canvas-note").boundingBox())!;
  }

  const getNoteStrokes = async (page: Page) =>
    (
      (await readSaved(page, "notes"))[0] as unknown as {
        strokes: SavedStroke[];
      }
    ).strokes;

  test("onto a note puts it on the note, which it then moves with", async ({
    page,
  }) => {
    const box = await addNoteAndStroke(page);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(220, 300);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y, { steps: 8 });
    await expect(page.locator(".canvas-note[data-drop-target]")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".canvas-note[data-drop-target]")).toHaveCount(0);

    await getStrokes(page, 0);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(1);
    // From the note's corner, and still picked.
    const [stroke] = await getNoteStrokes(page);
    expect(stroke.points[0].y).toBeCloseTo(box.height / 2, 0);
    await expect(outlines(page)).toHaveCount(1);

    // One change to undo.
    await page.getByRole("button", { name: "Undo" }).click();
    await getStrokes(page, 1);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(0);
  });

  test("off a note puts it on the drawing", async ({ page }) => {
    const box = await addNoteAndStroke(page);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, [220, 300], [middle.x, middle.y]);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(1);

    await drag(page, [middle.x, middle.y], [200, 500]);

    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(0);
    const [stroke] = await getStrokes(page, 1);
    expect(stroke.points[0].y).toBeCloseTo(500, 0);
    await expect(outlines(page)).toHaveCount(1);
    expect(await page.locator(".canvas-note").boundingBox()).toEqual(box);
  });

  // A line wider than the note, just below it, and its middle.
  async function addLongLine(page: Page, box: NonNullable<Box>) {
    await pick(page, "Pencil");
    const y = box.y + box.height + 40;
    await drag(page, [box.x - 100, y], [box.x + box.width + 100, y]);
    await pick(page, "Select");
    await getStrokes(page, 2);
    return { x: box.x + box.width / 2, y };
  }

  test("onto a note it doesn't fit in still puts it on the note, whole", async ({
    page,
  }) => {
    const box = await addNoteAndStroke(page);
    const line = await addLongLine(page, box);
    const [, before] = await readSaved(page, "strokes");
    const inside = { x: line.x, y: box.y + box.height / 2 };

    await page.mouse.move(line.x, line.y);
    await page.mouse.down();
    await page.mouse.move(inside.x, inside.y, { steps: 8 });
    await expect(page.locator(".canvas-note[data-drop-target]")).toHaveCount(1);
    await page.mouse.up();

    await getStrokes(page, 1);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(1);
    // Hidden past the note's edge, but all still there.
    const [kept] = await getNoteStrokes(page);
    expect(kept.points.length).toBe(before.points.length);
    expect(kept.points.at(-1)!.x - kept.points[0].x).toBeGreaterThan(box.width);

    // So dragging it off brings all of it back.
    await drag(page, [inside.x, inside.y], [inside.x, 600]);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(0);
    const [, back] = await getStrokes(page, 2);
    expect(back.points.at(-1)!.x - back.points[0].x).toBeGreaterThan(box.width);
  });

  test("a line across a note stays on the drawing when it's only nudged", async ({
    page,
  }) => {
    const box = await addNoteAndStroke(page);
    await pick(page, "Pencil");
    const y = box.y + box.height / 2;
    await drag(page, [box.x - 100, y], [box.x + box.width + 100, y]);
    await pick(page, "Select");
    await getStrokes(page, 2);
    const x = box.x + box.width / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 20, { steps: 4 });
    await expect(page.locator(".canvas-note[data-drop-target]")).toHaveCount(0);
    await page.mouse.up();

    await expect
      .poll(async () => (await readSaved(page, "strokes"))[1].points[0].y)
      .toBeCloseTo(y + 20, 0);
    expect(await getNoteStrokes(page)).toEqual([]);

    // Taken off the note and brought back, it's meant.
    const yAfter = y + 20;
    await page.mouse.move(x, yAfter);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height + 80, { steps: 4 });
    await page.mouse.move(x, y, { steps: 4 });
    await expect(page.locator(".canvas-note[data-drop-target]")).toHaveCount(1);
    await page.mouse.up();
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(1);
  });

  test("a stroke past a smaller note's edge is kept, and shows again", async ({
    page,
  }) => {
    const box = await addNoteAndStroke(page);
    await pick(page, "Pencil");
    const x = box.x + box.width - 20;
    const y = box.y + box.height / 2;
    await drag(page, [x - 60, y], [x, y]);
    await pick(page, "Select");
    await page.mouse.click(1000, 620);
    const [drawn] = await getNoteStrokes(page);

    // Selected, its right side made narrower than the stroke reaches.
    const note = page.locator(".canvas-note");
    await page.mouse.click(box.x + 20, box.y + 20);
    await drag(
      page,
      [box.x + box.width, box.y + box.height / 2],
      [box.x + box.width - 60, box.y + box.height / 2]
    );
    await expect
      .poll(async () => (await note.boundingBox())!.width)
      .toBeCloseTo(box.width - 60, 0);

    const [kept] = await getNoteStrokes(page);
    expect(kept.points).toEqual(drawn.points);
  });

  test("shows it unclipped as it's dragged off a note", async ({ page }) => {
    const box = await addNoteAndStroke(page);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, [220, 300], [middle.x, middle.y]);
    await expect.poll(async () => (await getNoteStrokes(page)).length).toBe(1);

    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(200, 500, { steps: 8 });
    const alpha = await page
      .locator(".canvas-floating-strokes")
      .evaluate((canvas: HTMLCanvasElement) => {
        const ratio = window.devicePixelRatio || 1;
        return canvas
          .getContext("2d")!
          .getImageData(200 * ratio, 500 * ratio, 1, 1).data[3];
      });
    await page.mouse.up();

    expect(alpha).toBeGreaterThan(0);
  });

  test("dragged with an item, it stays on what it's on", async ({ page }) => {
    const box = await addNoteAndStroke(page);
    await page.keyboard.press("ControlOrMeta+a");

    // Far enough to land on nothing else, and with the note along with it.
    await drag(page, [220, 300], [220 + 20, 300 + 20]);

    await getStrokes(page, 1);
    expect(await getNoteStrokes(page)).toEqual([]);
    await expect
      .poll(async () => (await page.locator(".canvas-note").boundingBox())!.x)
      .toBeCloseTo(box.x + 20, 0);
  });
});

test.describe("a note's ink", () => {
  // A note with a line across its middle, and the middle of the line.
  async function addInkedNote(page: Page) {
    await pick(page, "Sticky note");
    await page.keyboard.down("Alt");
    await page.mouse.click(640, 370);
    await page.keyboard.up("Alt");
    await page.keyboard.press("Escape");
    const box = (await page.locator(".canvas-note").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await pick(page, "Pencil");
    await drag(page, [x - 40, y], [x + 40, y]);
    await pick(page, "Select");
    await page.mouse.click(1000, 620);
    return { box, x, y };
  }
  const note = (page: Page) => page.locator(".canvas-note");

  test("is part of the note: pressing it moves the note", async ({ page }) => {
    const { box, x, y } = await addInkedNote(page);

    await drag(page, [x, y], [x + 100, y + 50]);

    await expect(outlines(page)).toHaveCount(0);
    const moved = (await note(page).boundingBox())!;
    expect(moved.x).toBeCloseTo(box.x + 100, 0);
  });

  test("double-clicking it types in the note, picked or not", async ({
    page,
  }) => {
    const { x, y } = await addInkedNote(page);

    await page.mouse.dblclick(x, y);
    await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(1);
    await page.keyboard.type("Hi");
    await page.keyboard.press("Escape");
    await expect(note(page)).toContainText("Hi");
    await expect(outlines(page)).toHaveCount(0);

    // With the note already picked.
    await page.waitForTimeout(450);
    await page.mouse.click(x, y);
    await page.waitForTimeout(450);
    await page.mouse.dblclick(x, y);
    await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(1);
  });

  test("pressing a picked stroke straight after clicking it drags it", async ({
    page,
  }) => {
    const { box, x, y } = await addInkedNote(page);
    await pickInk(page, x, y);

    await drag(page, [x, y], [x, y + 20]);

    await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(0);
    expect(await note(page).boundingBox()).toEqual(box);
    await expect(outlines(page)).toHaveCount(1);
  });

  test("right-clicking it opens the note's menu, until the stroke's picked", async ({
    page,
  }) => {
    const { x, y } = await addInkedNote(page);

    await page.mouse.click(x, y, { button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(note(page)).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(note(page)).toHaveCount(1);
    await page.mouse.click(1000, 620);

    await pickInk(page, x, y);
    await page.mouse.click(x, y, { button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(note(page)).toHaveCount(1);
    await expect
      .poll(() =>
        readSaved(page, "notes").then(
          (notes) =>
            (notes[0] as unknown as { strokes: SavedStroke[] }).strokes.length
        )
      )
      .toBe(0);
  });

  test("a second click picks the stroke, and Escape goes back a step", async ({
    page,
  }) => {
    const { x, y } = await addInkedNote(page);

    await page.mouse.click(x, y);
    await expect(note(page)).toHaveAttribute("data-selected");
    await expect(outlines(page)).toHaveCount(0);

    await page.waitForTimeout(450);
    await page.mouse.click(x, y);
    await expect(outlines(page)).toHaveCount(1);
    await expect(note(page)).not.toHaveAttribute("data-selected");
    await expect(note(page)).toHaveAttribute("data-ink-picked");

    await page.keyboard.press("Escape");
    await expect(outlines(page)).toHaveCount(0);
    await expect(note(page)).toHaveAttribute("data-selected");
    await expect(note(page)).not.toHaveAttribute("data-ink-picked");

    await page.keyboard.press("Escape");
    await expect(note(page)).not.toHaveAttribute("data-selected");
  });

  test("pointing shows what clicking would pick", async ({ page }) => {
    const { x, y } = await addInkedNote(page);
    await pick(page, "Pencil");
    await drag(page, [200, 300], [300, 300]);
    await pick(page, "Select");
    await page.mouse.click(1000, 620);
    const hover = page.locator(".canvas-stroke-hover");

    // A stroke on the drawing, and it goes when the mouse does.
    await page.mouse.move(250, 300);
    await expect(hover).toBeVisible();
    await page.mouse.move(1000, 620);
    await expect(hover).toBeHidden();

    // Ink on a note is the note, until the note is picked.
    await page.mouse.move(x, y);
    await expect(note(page)).toHaveAttribute("data-ink-hover");
    await expect(hover).toBeHidden();
    await page.mouse.click(x, y);
    await page.mouse.move(x + 1, y);
    await expect(note(page)).not.toHaveAttribute("data-ink-hover");
    await expect(hover).toBeVisible();

    // Nothing with another tool.
    await pick(page, "Hand");
    await page.mouse.move(250, 300);
    await expect(hover).toBeHidden();
  });

  test("works by touch: a tap picks the note, and another the stroke", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.goto(PAGE);
    const { x, y } = await addInkedNote(page);

    await page.touchscreen.tap(x, y);
    await expect(note(page)).toHaveAttribute("data-selected");
    await page.waitForTimeout(450);
    await page.touchscreen.tap(x, y);
    await expect(outlines(page)).toHaveCount(1);
    await expect(note(page)).toHaveAttribute("data-ink-picked");
  });
});

test.describe("a note's ink stays still as the note's resized", () => {
  // The biggest change between one frame and the next, out of 255, over where
  // the ink is, as `side` of the note is dragged a fraction of a pixel at a
  // time. The first frames are left out: a stroke's drawn again once, all at
  // once, after being drawn a piece at a time.
  async function measure(browser: Browser, side: string, zoomIn: boolean) {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto(PAGE);
    if (zoomIn) {
      await page.mouse.move(600, 350);
      await page.keyboard.press("ControlOrMeta+=");
    }
    await pick(page, "Sticky note");
    await page.keyboard.down("Alt");
    await page.mouse.click(600, 350);
    await page.keyboard.up("Alt");
    await page.keyboard.press("Escape");
    const box = (await page.locator(".canvas-note").boundingBox())!;
    const x = box.x + box.width * 0.45;
    const y = box.y + box.height / 2;
    await pick(page, "Pencil");
    await page.mouse.move(x - 40, y - 20);
    await page.mouse.down();
    await page.mouse.move(x, y + 20, { steps: 6 });
    await page.mouse.move(x + 40, y - 20, { steps: 6 });
    await page.mouse.up();
    await pick(page, "Select");
    await page.mouse.click(box.x + 8, box.y + box.height - 8);

    const [fromX, fromY, stepX, stepY] = {
      right: [box.x + box.width, y, 1.37, 0],
      bottom: [x, box.y + box.height, 0, 1.37],
      left: [box.x, y, -1.37, 0],
      top: [x, box.y, 0, -1.37],
    }[side]!;
    const clip = { x: x - 50, y: y - 30, width: 100, height: 60 };
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    const shots: string[] = [];
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(fromX + stepX * step, fromY + stepY * step);
      await page.waitForTimeout(20);
      shots.push((await page.screenshot({ clip })).toString("base64"));
    }
    await page.mouse.up();
    const biggest = await page.evaluate(async (images) => {
      const read = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      let change = 0;
      let before = await read(images[2]);
      for (const image of images.slice(3)) {
        const pixels = await read(image);
        pixels.forEach((value, index) => {
          change = Math.max(change, Math.abs(value - before[index]));
        });
        before = pixels;
      }
      return change;
    }, shots);
    await context.close();
    return biggest;
  }

  for (const side of ["right", "bottom", "left", "top"]) {
    for (const zoomIn of [false, true]) {
      test(`from its ${side}${zoomIn ? ", zoomed in" : ""}`, async ({
        browser,
        browserName,
      }) => {
        test.skip(browserName !== "chromium");
        // Too little to see.
        expect(await measure(browser, side, zoomIn)).toBeLessThan(20);
      });
    }
  }
});

test("the eraser cuts a note's strokes too", async ({ page }) => {
  await pick(page, "Sticky note");
  await page.keyboard.down("Alt");
  await page.mouse.click(500, 300);
  await page.keyboard.up("Alt");
  await page.keyboard.press("Escape");
  const box = (await page.locator(".canvas-note").boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;

  await pick(page, "Pencil");
  await drag(page, [x - 60, y], [x + 60, y]);
  await pick(page, "Eraser");
  await drag(page, [x, y - 30], [x, y + 30]);

  await expect
    .poll(() =>
      readSaved(page, "notes").then(
        (notes) =>
          (notes[0] as unknown as { strokes: SavedStroke[] }).strokes.length
      )
    )
    .toBe(2);
});

test("what an eraser left on a fill can be picked, and deleting it puts the fill back", async ({
  page,
}) => {
  await pick(page, "Pencil");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  for (const [x, y] of [
    [600, 200],
    [600, 400],
    [400, 400],
    [400, 200],
  ]) {
    await page.mouse.move(x, y, { steps: 5 });
  }
  await page.mouse.up();
  await pick(page, "Paint bucket");
  await page.mouse.click(500, 300);
  await expect
    .poll(async () => (await readSaved(page, "fills")).length)
    .toBe(1);

  await pick(page, "Eraser");
  await drag(page, [470, 300], [530, 300]);
  await expect
    .poll(async () => (await readSaved(page, "erasers")).length)
    .toBe(1);

  await pick(page, "Select");
  await page.mouse.click(500, 300);
  await expect(page.locator(".canvas-stroke-box[data-eraser]")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await readSaved(page, "erasers")).length)
    .toBe(0);

  // A box drawn over it doesn't pick what can't be seen.
  await pick(page, "Eraser");
  await drag(page, [470, 300], [530, 300]);
  await pick(page, "Select");
  await drag(page, [450, 280], [550, 320]);
  await expect(page.locator(".canvas-stroke-box[data-eraser]")).toHaveCount(0);
});

test("a canvas saved before erasers cut strokes opens cut", async ({
  page,
}) => {
  await drawLine(page);
  const [line] = await getStrokes(page, 1);

  // As it would have been saved: no ids, and the eraser among the strokes.
  await page.evaluate(
    ({ points, size, color }) => {
      for (const key of Object.keys(localStorage)) {
        if (key.endsWith(":strokes")) {
          localStorage.setItem(
            key,
            JSON.stringify([
              { color, points, size },
              { points: [{ x: 500, y: 300 }], size: 20 },
            ])
          );
        } else if (key.endsWith(":order")) {
          localStorage.setItem(
            key,
            JSON.stringify([{ kind: "strokes", count: 2 }])
          );
        } else if (key.endsWith(":erasers")) {
          localStorage.removeItem(key);
        }
      }
    },
    line as unknown as {
      points: { x: number; y: number }[];
      size: number;
      color: string;
    }
  );
  await page.reload();
  await expect(page.locator(".canvas-drawing")).toBeVisible();

  const strokes = await getStrokes(page, 2);
  expect(strokes.every(({ id }) => id)).toBe(true);
  await page.getByRole("button", { name: "Select" }).click();
  await page.mouse.click(350, 300);
  await expect(outlines(page)).toHaveCount(1);
});

test("the hand and drawing tools don't pick strokes", async ({ page }) => {
  await drawLine(page);

  await pick(page, "Hand");
  await page.mouse.click(500, 300);
  await expect(outlines(page)).toHaveCount(0);

  await pick(page, "Select");
  await page.mouse.click(500, 300);
  await expect(outlines(page)).toHaveCount(1);
  // Putting the select tool down leaves nothing picked.
  await pick(page, "Pencil");
  await expect(outlines(page)).toHaveCount(0);
});

test.describe("with one finger", () => {
  async function openTouchPage(browser: Browser) {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.goto(PAGE);
    await drawLine(page);
    await page.mouse.click(500, 500);
    const client = await context.newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      points: [number, number][]
    ) =>
      client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });
    return { page, touch };
  }

  test("a stroke is dragged, and a second finger puts it back", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");
    const { page, touch } = await openTouchPage(browser);
    const [before] = await getStrokes(page, 1);

    await touch("touchStart", [[500, 300]]);
    await touch("touchMove", [[520, 320]]);
    await touch("touchStart", [
      [520, 320],
      [620, 320],
    ]);
    await touch("touchEnd", []);

    expect((await readSaved(page, "strokes"))[0].points[0]).toEqual(
      before.points[0]
    );
  });

  test("resting on a stroke opens its menu", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");
    const { page, touch } = await openTouchPage(browser);

    await touch("touchStart", [[500, 300]]);
    await expect(
      page.getByRole("menuitem", { name: "Bring to front" })
    ).toBeVisible();
    await touch("touchEnd", []);
  });
});
