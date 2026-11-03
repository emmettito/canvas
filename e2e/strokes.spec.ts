import { type Browser, expect, type Page, test } from "@playwright/test";

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
