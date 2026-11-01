import { type Browser, expect, type Page, test } from "@playwright/test";

// The test page, which draws together through the dev server, or `vite
// preview`.
const PAGE = "/e2e/fixtures/full.html";

// What the test page keeps on `window`: the mounted canvas, and functions to
// join a room and leave it.
interface TestPage {
  canvas: {
    canvasId: string;
    setAuthor: (name: { firstName: string; lastName: string }) => void;
    setAvatar: (avatar: string) => void;
  };
  join: (room: string) => string;
  leave: () => void;
}

// Plays the timer's sounds silently, so running the tests isn't noisy:
// everything plays as it would, into a gain of 0 in front of the speakers.
// Each tone started is counted, as `tonesPlayed`, to check a sound played.
function muteAudio() {
  const Audio = window.AudioContext;
  const played = window as unknown as { tonesPlayed: number };
  played.tonesPlayed = 0;
  // No class fields, since Playwright compiles them to helpers the page
  // doesn't have. Its own `destination` hides the speakers'.
  window.AudioContext = class extends Audio {
    constructor(options?: AudioContextOptions) {
      super(options);
      const muted = this.createGain();
      muted.gain.value = 0;
      muted.connect(super.destination);
      Object.defineProperty(this, "destination", { value: muted });
    }

    override createOscillator() {
      played.tonesPlayed++;
      return super.createOscillator();
    }
  };
}

// A page of its own, as someone else on another computer would have, with
// their own storage.
async function openPage(browser: Browser, url = PAGE): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(muteAudio);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  await expect(page.locator("canvas").first()).toBeVisible();
  return page;
}

// Signs the page with a name, as a page's own name fields would.
function setName(page: Page, firstName: string, lastName = "") {
  return page.evaluate(
    (name) => (window as unknown as TestPage).canvas.setAuthor(name),
    { firstName, lastName }
  );
}

// Draws the open canvas together with anyone who opens the returned address.
async function share(page: Page): Promise<string> {
  const room = await page.evaluate(() => {
    const test = window as unknown as TestPage;
    return test.join(test.canvas.canvasId);
  });
  return `${PAGE}?room=${encodeURIComponent(room)}`;
}

// Places text at `x`, `y`, as shares of the canvas, and stops typing in it.
async function addText(page: Page, text: string, x: number, y: number) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

function getTexts(page: Page) {
  return page.getByRole("textbox", { name: "Text", exact: true });
}

// Two people drawing together on A's canvas, which already has some text.
async function openTogether(browser: Browser) {
  const a = await openPage(browser);
  await setName(a, "Ada");
  await addText(a, "Before", 0.2, 0.2);
  const link = await share(a);
  const b = await openPage(browser, link);
  await setName(b, "Bo");
  // Once each knows the other's name.
  for (const [page, name] of [
    [a, "Bo"],
    [b, "Ada"],
  ] as const) {
    await expect(
      page
        .getByRole("list", { name: "People here" })
        .getByRole("listitem", { name, exact: true })
    ).toBeVisible();
  }
  return { a, b };
}

test("someone who opens the link sees the canvas, and both see each other's changes", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await expect(getTexts(b)).toHaveText(["Before"]);

  await addText(a, "From Ada", 0.4, 0.4);
  await expect(getTexts(b)).toHaveText(["Before", "From Ada"]);
  await addText(b, "From Bo", 0.6, 0.6);
  await expect(getTexts(a)).toHaveText(["Before", "From Ada", "From Bo"]);
});

test("undo only undoes your own changes", async ({ browser }) => {
  const { a, b } = await openTogether(browser);
  await addText(a, "From Ada", 0.4, 0.4);
  await expect(getTexts(b)).toHaveCount(2);
  await addText(b, "From Bo", 0.6, 0.6);
  await expect(getTexts(a)).toHaveCount(3);

  // Ada's is older than Bo's, but Bo's stays.
  await a.getByRole("button", { name: "Undo" }).click();
  await expect(getTexts(a)).toHaveText(["Before", "From Bo"]);
  await expect(getTexts(b)).toHaveText(["Before", "From Bo"]);
  // What was there before sharing isn't Ada's to undo.
  await expect(a.getByRole("button", { name: "Undo" })).toBeDisabled();

  await a.getByRole("button", { name: "Redo" }).click();
  await expect(getTexts(b)).toHaveText(["Before", "From Ada", "From Bo"]);
});

test("each person sees who else is here, and where they're pointing", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const people = a.getByRole("list", { name: "People here" });
  // Bo, then Ada, who's shown as You.
  await expect(people.getByRole("listitem")).toHaveCount(2);
  await expect(people.getByRole("listitem").first()).toHaveAccessibleName("Bo");
  await expect(people.getByRole("listitem").last()).toHaveAccessibleName("You");

  const box = (await b.locator("canvas").first().boundingBox())!;
  await b.mouse.move(box.x + 300, box.y + 200);
  const cursor = a.locator(".canvas-peer-cursor");
  await expect(cursor).toHaveText("Bo");
  const shown = (await cursor.boundingBox())!;
  // At the same place on the drawing, with the same view.
  expect(shown.x).toBeCloseTo(box.x + 300, -1);
  expect(shown.y).toBeCloseTo(box.y + 200, -1);

  // Leaving takes them off.
  await b.close();
  await expect(people).toBeHidden();
  await expect(cursor).toHaveCount(0);
});

test("text being typed isn't lost when someone else changes the drawing", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await a.getByRole("button", { name: "Text", exact: true }).click();
  const box = (await a.locator("canvas").first().boundingBox())!;
  await a.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await a.keyboard.type("Still typing");

  await addText(b, "From Bo", 0.7, 0.7);
  await expect(getTexts(a)).toHaveCount(3);
  await a.keyboard.type(", and done");
  await a.keyboard.press("Escape");

  await expect(getTexts(b)).toContainText(["Still typing, and done"]);
});

test("an image added while drawing together shows for everyone", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const png = await a.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 120, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const chooser = a.waitForEvent("filechooser");
  await a.getByRole("button", { name: "Insert image" }).click();
  await (
    await chooser
  ).setFiles({
    name: "picture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });

  const image = b.locator(".canvas-image-file");
  await expect(image).toHaveCount(1);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(120);
});

test("leaving the room keeps the drawing", async ({ browser }) => {
  const { a, b } = await openTogether(browser);
  await b.evaluate(() => (window as unknown as TestPage).leave());

  await addText(a, "After", 0.5, 0.5);
  await expect(getTexts(a)).toHaveCount(2);
  await expect(getTexts(b)).toHaveText(["Before"]);
  await expect(a.getByRole("list", { name: "People here" })).toBeHidden();
});

test("each person's photo shows in the corner, but not by their pointer", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  // A small square photo, as a page would make from the one picked.
  await b.evaluate(() => {
    const photo = document.createElement("canvas");
    photo.width = 128;
    photo.height = 128;
    const context = photo.getContext("2d")!;
    context.fillStyle = "#3b82f6";
    context.fillRect(0, 0, 128, 128);
    (window as unknown as TestPage).canvas.setAvatar(
      photo.toDataURL("image/jpeg")
    );
  });

  const person = a
    .getByRole("list", { name: "People here" })
    .getByRole("listitem", { name: "Bo" });
  const photo = person.locator(".canvas-person-avatar");
  await expect(photo).toHaveAttribute("src", /^data:image\/jpeg/);
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(128);
  const box = (await b.locator("canvas").first().boundingBox())!;
  await b.mouse.move(box.x + 300, box.y + 200);
  await expect(a.locator(".canvas-peer-cursor")).toHaveCount(1);
  await expect(a.locator(".canvas-peer-cursor img")).toHaveCount(0);

  // Removing it shows their initial again.
  await b.evaluate(() => (window as unknown as TestPage).canvas.setAvatar(""));
  await expect(photo).toHaveCount(0);
  await expect(person).toHaveText(/^B/);
});

test("each person is the same color for everyone, themselves included", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const colorOf = (page: Page, name: string) =>
    page
      .getByRole("list", { name: "People here" })
      .getByRole("listitem", { name, exact: true })
      .locator(".canvas-person")
      .evaluate((person) =>
        getComputedStyle(person).getPropertyValue("--canvas-peer-color")
      );

  const adaColor = await colorOf(a, "You");
  const boColor = await colorOf(b, "You");
  expect(adaColor).not.toBe(boColor);
  expect(await colorOf(b, "Ada")).toBe(adaColor);
  expect(await colorOf(a, "Bo")).toBe(boColor);

  // Bo's pointer, on Ada's canvas, is Bo's color too.
  const box = (await b.locator("canvas").first().boundingBox())!;
  await b.mouse.move(box.x + 300, box.y + 200);
  await expect(a.locator(".canvas-peer-cursor")).toHaveCSS(
    "--canvas-peer-color",
    boColor
  );
});

test("pointers show first names, and more once two people share one", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await setName(a, "Ada", "Lovelace");
  const box = (await b.locator("canvas").first().boundingBox())!;
  const cursor = a.locator(".canvas-peer-cursor");
  // Bo points again after each rename.
  const rename = async (firstName: string, lastName: string) => {
    await setName(b, firstName, lastName);
    await b.mouse.move(box.x + 300, box.y + 200);
    await b.mouse.move(box.x + 310, box.y + 200);
  };

  await rename("Bo", "Diddley");
  await expect(cursor).toHaveText("Bo");
  // Their whole name's in the row.
  await expect(
    a.getByRole("list", { name: "People here" }).getByRole("listitem").first()
  ).toHaveAccessibleName("Bo Diddley");

  await rename("Ada", "King");
  await expect(cursor).toHaveText("Ada K.");
  await rename("Ada", "Lamb");
  await expect(cursor).toHaveText("Ada Lamb");

  // On Bo's canvas too, where the other Ada is Ada's.
  const other = (await a.locator("canvas").first().boundingBox())!;
  await a.mouse.move(other.x + 200, other.y + 100);
  await expect(b.locator(".canvas-peer-cursor")).toHaveText("Ada Lovelace");
});

test("pointers look like the tool they're pointing with", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const box = (await b.locator("canvas").first().boundingBox())!;
  const cursor = a.locator(".canvas-peer-cursor");
  const point = async (x: number) => {
    await b.mouse.move(box.x + x, box.y + 200);
    await expect
      .poll(async () => (await cursor.boundingBox())?.x)
      .toBeCloseTo(box.x + x, -1);
  };

  await b.getByRole("button", { name: "Pencil" }).click();
  await point(300);
  await expect(cursor).toHaveAttribute("data-kind", "brush");
  // As big as the pencil draws, since both are at the same zoom.
  const size = await b
    .locator(".canvas-cursor")
    .evaluate((each) => each.getBoundingClientRect().width);
  const ring = cursor.locator(".canvas-peer-ring");
  await expect
    .poll(() => ring.evaluate((each) => each.getBoundingClientRect().width))
    .toBeCloseTo(Math.max(8, size), 0);

  // Picking a tool by its key, while pointing, shows without moving.
  for (const [key, kind] of [
    ["e", "eraser"],
    ["t", "text"],
    ["n", "crosshair"],
    ["i", "dropper"],
    ["v", "arrow"],
  ]) {
    await b.keyboard.press(key);
    await expect(cursor).toHaveAttribute("data-kind", kind);
  }
  // Still in their color.
  await expect(cursor.locator(".canvas-peer-glyph")).toHaveCSS(
    "fill",
    await cursor
      .evaluate((each) =>
        getComputedStyle(each).getPropertyValue("--canvas-peer-color")
      )
      .then(hexToRgb)
  );
});

// "#e5484d" as CSS computes it, "rgb(229, 72, 77)".
function hexToRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) =>
    parseInt(hex.trim().slice(at, at + 2), 16)
  );
  return `rgb(${r}, ${g}, ${b})`;
}

test("others see a stroke as it's drawn, before it's finished", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await a.getByRole("button", { name: "Pencil" }).click();
  const box = (await a.locator("canvas").first().boundingBox())!;
  await a.mouse.move(box.x + 200, box.y + 300);
  await a.mouse.down();
  await a.mouse.move(box.x + 400, box.y + 320, { steps: 10 });

  const ink = b.locator(".canvas-peer-ink");
  await expect(ink).toHaveCount(1);
  // Ada's stroke, partway, in Ada's color, where Ada's drawing it.
  await expect
    .poll(() =>
      ink.evaluate(
        (canvas: HTMLCanvasElement, at) => {
          const ratio = canvas.width / canvas.clientWidth;
          return canvas
            .getContext("2d")!
            .getImageData(at.x * ratio, at.y * ratio, 1, 1).data[3];
        },
        { x: 300, y: 310 }
      )
    )
    .toBeGreaterThan(0);

  // Once it's finished, it's in the drawing instead.
  await a.mouse.up();
  await expect(ink).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(a.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("others see a note as it's moved, and as it's typed in", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const box = (await a.locator("canvas").first().boundingBox())!;
  await a.getByRole("button", { name: "Sticky note" }).click();
  await a.mouse.click(box.x + 300, box.y + 300);
  await a.keyboard.type("Half typed");

  // It shows for Bo before Ada's done with it, outlined in Ada's color.
  const note = b.locator(".canvas-note");
  await expect(note).toHaveText(/Half typed/);
  await expect(note).toHaveAttribute("data-peer");
  await a.keyboard.press("Escape");
  await expect(note).not.toHaveAttribute("data-peer");

  // Moving it, it follows Ada's pointer before it's dropped.
  const before = (await note.boundingBox())!;
  await a.getByRole("button", { name: "Move" }).click();
  await a.mouse.move(box.x + 300, box.y + 300);
  await a.mouse.down();
  await a.mouse.move(box.x + 420, box.y + 360, { steps: 10 });
  await expect
    .poll(async () => (await note.boundingBox())!.x)
    .toBeCloseTo(before.x + 120, -1);
  await expect(note).toHaveAttribute("data-peer");
  await a.mouse.up();
  await expect(note).not.toHaveAttribute("data-peer");
  expect((await note.boundingBox())!.y).toBeCloseTo(before.y + 60, -1);
});

test("others see shapes, and what's picked moving together", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  const box = (await a.locator("canvas").first().boundingBox())!;
  const drag = async (from: [number, number], to: [number, number]) => {
    await a.mouse.move(box.x + from[0], box.y + from[1]);
    await a.mouse.down();
    await a.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
    await a.mouse.up();
  };
  await a.keyboard.press("r");
  await drag([300, 300], [400, 400]);

  await a.keyboard.press("o");
  await drag([500, 300], [600, 400]);
  const shapes = b.locator(".canvas-shape");
  await expect(shapes).toHaveCount(2);

  await a.keyboard.press("ControlOrMeta+a");
  await drag([350, 300], [350, 250]);
  await expect
    .poll(() =>
      shapes.evaluateAll((each) =>
        each.map((shape) => (shape as HTMLElement).style.top)
      )
    )
    .toEqual(["250px", "250px"]);

  // One undo puts both back, for everyone.
  await a.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      shapes.evaluateAll((each) =>
        each.map((shape) => (shape as HTMLElement).style.top)
      )
    )
    .toEqual(["300px", "300px"]);
});

test("following someone shows what they see, until you move", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await b.getByRole("button", { name: "Follow Ada" }).click();
  await expect(
    b.getByRole("group", { name: "Following" }).getByText("Following Ada")
  ).toBeVisible();
  await expect(
    a.getByRole("group", { name: "Following" }).getByText("Bo is following you")
  ).toBeVisible();

  // A zooms in, and B follows.
  await a.getByRole("button", { name: "Zoom: 100%" }).click();
  await a.getByRole("button", { name: "Zoom in" }).click();
  await expect(
    b.getByRole("button", { name: /^Zoom: 1[45]\d%$/ })
  ).toBeVisible();

  // B zooming stops following.
  await b.getByRole("button", { name: /^Zoom: / }).click();
  await b.getByRole("button", { name: "Zoom to 100%" }).click();
  await expect(
    b.getByRole("group", { name: "Following" }).getByText("Following Ada")
  ).toBeHidden();
  await expect(
    a.getByRole("group", { name: "Following" }).getByText("Bo is following you")
  ).toBeHidden();
  await expect(b.getByRole("button", { name: "Follow Ada" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("Follow me has everyone follow, and they can be released", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await a.getByRole("button", { name: "Follow me" }).click();
  await expect(
    b.getByRole("group", { name: "Following" }).getByText("Following Ada")
  ).toBeVisible();
  await expect(
    a.getByRole("group", { name: "Following" }).getByText("Bo is following you")
  ).toBeVisible();

  await a.getByRole("button", { name: "Release Bo" }).click();
  await expect(
    a.getByRole("group", { name: "Following" }).getByText("Bo is following you")
  ).toBeHidden();
  await expect(
    b.getByRole("group", { name: "Following" }).getByText("Following Ada")
  ).toBeHidden();
});

test("a timer started by anyone counts down for everyone, and stops for everyone", async ({
  browser,
}) => {
  const { a, b } = await openTogether(browser);
  await a.getByRole("button", { name: "Timer", exact: true }).click();
  await a.getByRole("radio", { name: "3", exact: true }).check();
  await a.getByRole("radio", { name: "Bell" }).check();
  // Picking a sound plays it, to hear it.
  expect(
    await a.evaluate(
      () => (window as unknown as { tonesPlayed: number }).tonesPlayed
    )
  ).toBeGreaterThan(0);
  await a.getByRole("button", { name: "Start" }).click();

  await expect(
    a.getByRole("button", { name: /^Timer: 2:5\d left$/ })
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: /^Timer: 2:5\d left$/ })
  ).toBeVisible();
  await expect(b.getByText("Ada started a 3-minute timer")).toBeVisible();

  await b.getByRole("button", { name: /^Timer: / }).click();
  await expect(b.getByText("Started by Ada")).toBeVisible();
  await b.getByRole("button", { name: "Stop" }).click();
  await expect(
    a.getByRole("button", { name: "Timer", exact: true })
  ).toBeVisible();
});
