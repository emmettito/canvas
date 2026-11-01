import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator("canvas")).toBeVisible();
});

// Places text at a fraction of the canvas's width and height, and types it.
async function addText(page: Page, text: string, x = 0.4, y = 0.4) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.keyboard.type(text);
  // Typing ends when the text loses focus.
  await page.keyboard.press("Escape");
}

// Drags one of the text's handles, e.g. "se" for its bottom right corner,
// by `dx` and `dy` pixels.
async function dragHandle(page: Page, handle: string, dx: number, dy: number) {
  await page.locator(".canvas-text").hover();
  const box = (await page
    .locator(`.canvas-text-resize[data-handle="${handle}"]`)
    .boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

// Pointer positions can be rounded to whole pixels, so positions are checked
// to within a couple of pixels.
function expectNear(received: number, expected: number, within = 2) {
  expect(Math.abs(received - expected)).toBeLessThanOrEqual(within);
}

function getTexts(page: Page) {
  return page.getByRole("textbox", { name: "Text", exact: true });
}

// Places text and selects all of it, ready to format.
async function selectNewText(page: Page, text: string) {
  await addText(page, text);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+a");
}

function getFormatBar(page: Page) {
  return page.getByRole("toolbar", { name: "Text formatting" });
}

test("text can be placed, typed, and undone", async ({ page }) => {
  await addText(page, "Hello");

  await expect(getTexts(page)).toHaveText("Hello");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(getTexts(page)).toHaveCount(0);
});

test("text is undone and redone with the keyboard", async ({ page }) => {
  await addText(page, "Hello");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(getTexts(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(getTexts(page)).toHaveText("Hello");
});

test("text left empty isn't kept", async ({ page }) => {
  await addText(page, "");

  await expect(getTexts(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("once typing's finished with Escape, the next press places again", async ({
  page,
}) => {
  await addText(page, "First", 0.2, 0.2);
  // Focus stays on the text, but the press isn't taken to finish typing.
  await expect(page.locator(".canvas-text")).toBeFocused();
  await page.mouse.click(600, 400);
  await page.keyboard.type("Second");
  await page.keyboard.press("Escape");
  await expect(getTexts(page)).toHaveText(["First", "Second"]);

  await page.keyboard.press("r");
  await page.mouse.move(300, 450);
  await page.mouse.down();
  await page.mouse.move(400, 550, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".canvas-shape")).toHaveCount(1);
});

test("new text is in the pencil's color, at the text size", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  // The text tool stays chosen.
  await expect(
    page.getByRole("button", { name: "Text", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  // Clicking it again opens its size slider.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("slider", { name: "Text size" }).fill("48");
  await page.keyboard.press("Escape");

  await addText(page, "Big");

  const text = page.locator(".canvas-text");
  await expect(text).toHaveCSS("font-size", "48px");
  await expect(text).toHaveCSS("color", "rgb(255, 0, 0)");
});

test("dragging text moves it", async ({ page }) => {
  await addText(page, "Move me");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await page.mouse.move(before.x + 10, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + before.height / 2 + 50, {
    steps: 5,
  });
  await page.mouse.up();

  const after = (await text.boundingBox())!;
  expectNear(after.x - before.x, 80);
  expectNear(after.y - before.y, 50);
});

test("dragging a side sets the width the text wraps at", async ({ page }) => {
  await addText(page, "A long line of text that wraps");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await dragHandle(page, "e", -before.width / 2, 0);

  const after = (await text.boundingBox())!;
  expectNear(after.width, before.width / 2);
  // Narrower, so it wraps onto more lines, at the same size.
  expect(after.height).toBeGreaterThan(before.height * 1.5);
  await expect(text).toHaveCSS("font-size", "24px");

  // Typing more keeps the width.
  await text.click();
  await page.keyboard.type(" at all, even when it's longer");
  await page.keyboard.press("Escape");
  expectNear((await text.boundingBox())!.width, after.width);
});

test("dragging the left side keeps the right side in place", async ({
  page,
}) => {
  await addText(page, "A long line of text that wraps");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await dragHandle(page, "w", before.width / 2, 0);

  const after = (await text.boundingBox())!;
  expectNear(after.width, before.width / 2);
  expectNear(after.x + after.width, before.x + before.width);
});

test("dragging a corner resizes the box, not the text", async ({ page }) => {
  await addText(page, "Resize me");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await dragHandle(page, "se", 60, 40);

  const after = (await text.boundingBox())!;
  expectNear(after.width, before.width + 60);
  expectNear(after.height, before.height + 40);
  expectNear(after.x, before.x);
  await expect(text).toHaveCSS("font-size", "24px");

  // And it can be undone.
  await page.getByRole("button", { name: "Undo" }).click();
  expectNear((await text.boundingBox())!.height, before.height);
});

test("the box can't be made shorter than its text", async ({ page }) => {
  await addText(page, "Tall\nenough");
  const text = page.locator(".canvas-text");
  const before = (await text.boundingBox())!;

  await dragHandle(page, "n", 0, before.height);

  const after = (await text.boundingBox())!;
  expectNear(after.height, before.height);
  expectNear(after.y, before.y);
});

test("the format bar shows only while typing", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);

  await expect(getFormatBar(page)).toBeVisible();
  // It's above the text.
  const bar = (await getFormatBar(page).boundingBox())!;
  const text = (await page.locator(".canvas-text").boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(text.y);

  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await expect(getFormatBar(page)).toBeHidden();
});

test("selected text can be made bold, italic, underlined and struck", async ({
  page,
}) => {
  await selectNewText(page, "Styled");
  const bar = getFormatBar(page);

  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) {
    await bar.getByRole("button", { name }).click();
    await expect(bar.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }
  await page.keyboard.press("Escape");

  const text = getTexts(page);
  await expect(text.locator("strong em u s")).toHaveText("Styled");
});

test("keyboard shortcuts format what's typed next", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);

  await page.keyboard.type("plain ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Escape");

  await expect(getTexts(page).locator("strong")).toHaveText("bold");
});

test("the color palette opens above text near the bottom", async ({ page }) => {
  await addText(page, "Low", 0.1, 0.92);
  await page.keyboard.press("Enter");
  const bar = getFormatBar(page);
  await bar.getByRole("button", { name: "Text color" }).click();

  const palette = (await page.locator(".canvas-format-colors").boundingBox())!;
  const canvas = (await page.locator("canvas").boundingBox())!;
  expect(palette.y).toBeGreaterThanOrEqual(canvas.y);
  expect(palette.y + palette.height).toBeLessThanOrEqual(
    canvas.y + canvas.height
  );
});

test("the font, size and color can be changed", async ({ page }) => {
  await selectNewText(page, "Fancy");
  const bar = getFormatBar(page);

  await bar
    .getByRole("combobox", { name: "Font", exact: true })
    .selectOption("Serif");
  await bar.getByRole("combobox", { name: "Font size" }).selectOption("48");
  await bar.getByRole("button", { name: "Text color" }).click();
  await bar.getByRole("button", { name: "blue", exact: true }).click();
  // Choosing them doesn't stop typing.
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");

  const span = getTexts(page).locator("[data-color]");
  await expect(span).toHaveText("Fancy");
  await expect(span).toHaveCSS("color", "rgb(44, 113, 255)");
  await expect(getTexts(page).locator("[data-size]")).toHaveCSS(
    "font-size",
    "48px"
  );
  await expect(getTexts(page).locator("[data-font]")).toHaveCSS(
    "font-family",
    /Georgia/
  );
});

test("the text's own color is chosen, and picking it removes others", async ({
  page,
}) => {
  await selectNewText(page, "Plain");
  const bar = getFormatBar(page);
  const colorButton = bar.getByRole("button", { name: "Text color" });

  await colorButton.click();
  await expect(bar.getByRole("button", { name: "black" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await bar.getByRole("button", { name: "blue", exact: true }).click();
  await expect(getTexts(page).locator("[data-color]")).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+a");
  await colorButton.click();
  await bar.getByRole("button", { name: "black" }).click();
  await expect(getTexts(page).locator("[data-color]")).toHaveCount(0);
});

test("paragraphs can be aligned", async ({ page }) => {
  await selectNewText(page, "Centered");

  await getFormatBar(page)
    .getByRole("button", { name: "Align center" })
    .click();
  await page.keyboard.press("Escape");

  await expect(getTexts(page).locator("p")).toHaveCSS("text-align", "center");
});

test("formatting is kept after a reload, and exported", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("Kept");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("Enter");
  await page.keyboard.type("and exported");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(getTexts(page).locator("p")).toHaveText([
    "Kept",
    "and exported",
  ]);
  await expect(getTexts(page).locator("strong")).toHaveText("Kept");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const svg = (await readFile(await (await download).path())).toString();
  expect(svg).toMatch(/font-weight="bold"[^>]*>Kept<\/tspan>/);
  expect(svg).toMatch(/<tspan(?![^>]*font-weight)[^>]*>and exported<\/tspan>/);
});

test("text is deleted from its menu", async ({ page }) => {
  await addText(page, "Bye");

  await page.locator(".canvas-text").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(getTexts(page)).toHaveCount(0);
});

test("a selection with mixed formatting shows none", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  const bar = getFormatBar(page);
  const size = bar.getByRole("combobox", { name: "Font size" });
  await size.selectOption("40");
  await page.keyboard.type("Big");
  await page.keyboard.press("Enter");
  await size.selectOption("24");
  await page.keyboard.type("small");
  await bar.getByRole("button", { name: "Align center" }).click();

  await page.keyboard.press("ControlOrMeta+a");

  await expect(size).toHaveValue("");
  // Only the second paragraph is centered.
  for (const name of ["Align left", "Align center", "Align right"]) {
    await expect(bar.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  }
});

test("an empty text box shows a hint, and is wide enough to find", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(400, 300);

  const text = page.locator(".canvas-text");
  await expect(text).toHaveAttribute("data-empty");
  // Four characters wide, at the 24-unit default.
  expect((await text.boundingBox())!.width).toBeGreaterThanOrEqual(96);

  await page.keyboard.type("Hi");
  await expect(text).not.toHaveAttribute("data-empty");
});

test("picking a color while typing colors the text, and typing goes on", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(400, 300);

  // From the toolbar, before typing anything.
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await page.keyboard.type("Red ");

  // A color code typed in, too.
  await page.getByRole("button", { name: "Color: red" }).click();
  const code = page.getByRole("textbox", { name: "Color code" });
  await code.fill("#0000ff");
  await code.press("Enter");
  await page.keyboard.type("blue");
  await page.keyboard.press("Escape");

  const spans = getTexts(page).locator("[data-color]");
  await expect(spans).toHaveText(["Red ", "blue"]);
  await expect(spans.first()).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(spans.last()).toHaveCSS("color", "rgb(0, 0, 255)");
});
