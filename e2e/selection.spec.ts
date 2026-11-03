import { type Browser, expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator(".canvas-drawing")).toBeVisible();
  // Three notes in a row, far enough apart not to line up with each other
  // as they're moved, then the select tool.
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
  await page.getByRole("button", { name: "Select" }).click();
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

test("dragging a box picks what it touches, instead of what's picked", async ({
  page,
}) => {
  await page.mouse.click(780, 250);
  expect(await getNotes(page)).toEqual(["200", "450", "700*"]);

  await drag(page, [150, 150], [500, 260]);
  expect(await getNotes(page)).toEqual(["200*", "450*", "700"]);
});

test("Shift-dragging a box adds to what's picked", async ({ page }) => {
  await page.mouse.click(780, 250);

  await drag(page, [150, 150], [300, 260], ["Shift"]);
  expect(await getNotes(page)).toEqual(["200*", "450", "700*"]);
});

test("the hand pans from anywhere, and can't pick, move or type", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("h");
  const hand = page.getByRole("button", { name: "Hand" });
  await expect(hand).toHaveAttribute("aria-pressed", "true");
  // Picking it picks nothing.
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);
  await expect(page.locator(".canvas-input-layer")).toHaveCSS("cursor", "grab");

  await page.mouse.click(280, 250);
  await page.mouse.dblclick(280, 250);
  await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(0);
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);

  // Over an item as anywhere else, moving everything.
  await drag(page, [280, 250], [330, 250]);
  expect(await getNotes(page)).toEqual(["250", "500", "750"]);
  await drag(page, [100, 500], [50, 500]);
  expect(await getNotes(page)).toEqual(["200", "450", "700"]);
  await expect(page.locator(".canvas-marquee")).toHaveCount(0);
});

test("picking the hand finishes typing", async ({ page }) => {
  await page.mouse.dblclick(280, 250);
  await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(1);

  await page.getByRole("button", { name: "Hand" }).click();

  await expect(page.locator(".canvas-note[data-editing]")).toHaveCount(0);
});

test.describe("with one finger", () => {
  // Real touches are sent through Chromium's DevTools protocol.
  async function openTouchPage(browser: Browser) {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.goto("/e2e/fixtures/full.html");
    await page.getByRole("button", { name: "Sticky note" }).click();
    await page.keyboard.down("Alt");
    await page.mouse.click(280, 250);
    await page.keyboard.up("Alt");
    await page.keyboard.type("A");
    await page.keyboard.press("Escape");
    await page.keyboard.press("v");
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

  test("the select tool draws a box", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium");
    const { page, touch } = await openTouchPage(browser);

    await touch("touchStart", [[150, 150]]);
    await touch("touchMove", [[250, 200]]);
    await touch("touchMove", [[350, 300]]);
    await expect(page.locator(".canvas-marquee")).toHaveCount(1);
    await touch("touchEnd", []);

    await expect(page.locator(".canvas-marquee")).toHaveCount(0);
    expect(await getNotes(page)).toEqual(["200*"]);
  });

  test("a second finger cancels the box, keeping what was picked", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");
    const { page, touch } = await openTouchPage(browser);
    await page.mouse.click(280, 250);
    expect(await getNotes(page)).toEqual(["200*"]);

    await touch("touchStart", [[600, 500]]);
    await touch("touchMove", [[650, 520]]);
    await expect(page.locator(".canvas-marquee")).toHaveCount(1);
    expect(await getNotes(page)).toEqual(["200"]);
    await touch("touchStart", [
      [650, 520],
      [750, 520],
    ]);

    await expect(page.locator(".canvas-marquee")).toHaveCount(0);
    expect(await getNotes(page)).toEqual(["200*"]);
    await touch("touchEnd", []);
  });

  test("the hand pans", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium");
    const { page, touch } = await openTouchPage(browser);
    await page.keyboard.press("h");

    await touch("touchStart", [[600, 500]]);
    await touch("touchMove", [[620, 500]]);
    await touch("touchMove", [[650, 500]]);
    await touch("touchEnd", []);

    expect(await getNotes(page)).toEqual(["250"]);
  });
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
