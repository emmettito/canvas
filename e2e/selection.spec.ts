import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
  // Three notes in a row, far enough apart not to line up with each other
  // as they're moved, then the move tool.
  await page.getByRole("button", { name: "Sticky note" }).click();
  for (const x of [200, 450, 700]) {
    // Alt places each where it's pressed, rather than lined up.
    await page.keyboard.down("Alt");
    await page.mouse.click(x + 80, 250);
    await page.keyboard.up("Alt");
    await page.keyboard.type("A");
    await page.keyboard.press("Escape");
  }
  // The last note is picked, being focused, until the drawing's pressed.
  await page.getByRole("button", { name: "Move" }).click();
  await page.mouse.click(500, 500);
});

// Drags from `from` to `to` on screen, with `modifiers` held.
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
  await page.mouse.move(...to, { steps: 6 });
  await page.mouse.up();
  for (const key of modifiers) {
    await page.keyboard.up(key);
  }
}

async function shiftClick(page: Page, x: number, y: number) {
  await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  await page.keyboard.up("Shift");
}

// Each note's left edge on screen, and whether it's picked.
function getNotes(page: Page) {
  return page
    .locator(".canvas-note")
    .evaluateAll((notes) =>
      notes.map(
        (note) =>
          `${Math.round(note.getBoundingClientRect().x)}${note.hasAttribute("data-selected") ? "*" : ""}`
      )
    );
}

test("Shift-clicking picks several, which move together and undo together", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await shiftClick(page, 530, 250);
  expect(await getNotes(page)).toEqual(["200*", "450*", "700"]);

  await drag(page, [250, 250], [270, 250]);
  expect(await getNotes(page)).toEqual(["220*", "470*", "700"]);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await getNotes(page)).toEqual(["200*", "450*", "700"]);

  // Shift-clicking a picked one takes it away. The first, since pressing the
  // second again so soon would open it.
  await shiftClick(page, 280, 250);
  expect(await getNotes(page)).toEqual(["200", "450*", "700"]);
});

test("Shift-dragging a box picks what it touches, and Delete deletes them", async ({
  page,
}) => {
  await drag(page, [150, 150], [500, 260], ["Shift"]);
  expect(await getNotes(page)).toEqual(["200*", "450*", "700"]);

  await page.keyboard.press("Delete");
  expect(await getNotes(page)).toEqual(["700"]);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);
});

test("pressing the drawing or Escape picks nothing", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  expect(await getNotes(page)).toEqual(["200*", "450*", "700*"]);

  await page.keyboard.press("Escape");
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);

  await page.keyboard.press("ControlOrMeta+a");
  await page.mouse.click(500, 500);
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);
});

test("Ctrl+D copies what's picked, a little further on, and picks the copies", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await shiftClick(page, 530, 250);

  await page.keyboard.press("ControlOrMeta+d");

  await expect(page.locator(".canvas-note")).toHaveCount(5);
  expect(await getNotes(page)).toEqual(["200", "450", "700", "224*", "474*"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-note")).toHaveCount(3);
});

test("what's copied pastes a little further on each time, and cut deletes it", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await page.keyboard.press("ControlOrMeta+x");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(page.locator(".canvas-note")).toHaveCount(4);
  expect(await getNotes(page)).toEqual(["450", "700", "224", "248*"]);
});
