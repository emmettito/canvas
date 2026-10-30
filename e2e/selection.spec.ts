import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
  // Three filled rectangles in a row, then the move tool.
  for (const x of [200, 400, 600]) {
    await page.keyboard.press("r");
    await drag(page, [x, 200], [x + 100, 300]);
    await page.getByRole("button", { name: "Paint bucket" }).click();
    await page.mouse.click(x + 50, 250);
  }
  await page.getByRole("button", { name: "Move" }).click();
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

// Each shape's left edge on screen, and whether it's picked.
function getShapes(page: Page) {
  return page
    .locator(".canvas-shape")
    .evaluateAll((shapes) =>
      shapes.map(
        (shape) =>
          `${Math.round(shape.getBoundingClientRect().x)}${shape.hasAttribute("data-selected") ? "*" : ""}`
      )
    );
}

test("Shift-clicking picks several, which move together and undo together", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await shiftClick(page, 450, 250);
  expect(await getShapes(page)).toEqual(["200*", "400*", "600"]);

  await drag(page, [250, 250], [270, 250]);
  expect(await getShapes(page)).toEqual(["220*", "420*", "600"]);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await getShapes(page)).toEqual(["200*", "400*", "600"]);

  // Shift-clicking a picked one takes it away.
  await shiftClick(page, 450, 250);
  expect(await getShapes(page)).toEqual(["200*", "400", "600"]);
});

test("Shift-dragging a box picks what it touches, and Delete deletes them", async ({
  page,
}) => {
  await drag(page, [150, 150], [450, 260], ["Shift"]);
  expect(await getShapes(page)).toEqual(["200*", "400*", "600"]);

  await page.keyboard.press("Delete");
  expect(await getShapes(page)).toEqual(["600"]);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await getShapes(page)).toEqual(["200", "400", "600"]);
});

test("pressing the drawing or Escape picks nothing", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  expect(await getShapes(page)).toEqual(["200*", "400*", "600*"]);

  await page.keyboard.press("Escape");
  expect(await getShapes(page)).toEqual(["200", "400", "600"]);

  await page.keyboard.press("ControlOrMeta+a");
  await page.mouse.click(500, 500);
  expect(await getShapes(page)).toEqual(["200", "400", "600"]);
});

test("Ctrl+D copies what's picked, a little further on, and picks the copies", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await shiftClick(page, 450, 250);

  await page.keyboard.press("ControlOrMeta+d");

  await expect(page.locator(".canvas-shape")).toHaveCount(5);
  expect(await getShapes(page)).toEqual(["200", "400", "600", "224*", "424*"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".canvas-shape")).toHaveCount(3);
});

test("what's copied pastes a little further on each time, and cut deletes it", async ({
  page,
}) => {
  await page.mouse.click(250, 250);
  await page.keyboard.press("ControlOrMeta+x");
  await page.keyboard.press("ControlOrMeta+v");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(page.locator(".canvas-shape")).toHaveCount(4);
  expect(await getShapes(page)).toEqual(["400", "600", "224", "248*"]);
});
