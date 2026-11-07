import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { colorControl } from "../../controls/color-control";
import { customButton } from "../../controls/custom-button";
import { exportButton, exportItem } from "../../controls/export";
import { fileMenu } from "../../controls/file-menu";
import { historyButton, historyItem } from "../../controls/history";
import { newCanvasButton, newCanvasItem } from "../../controls/new-canvas";
import { renameItem } from "../../controls/rename";
import { eraserTool, pencilTool } from "../../controls/tools";
import { redoButton, undoButton } from "../../controls/undo-buttons";
import { zoomControl } from "../../controls/zoom-control";
import {
  type FileMenuItem,
  type ToolbarControl,
} from "../../models/toolbar-control.model";
import { type CanvasStore } from "../../models/canvas-store.model";
import { savedLocally } from "../../demo/local-store";
import { createMemoryStore } from "../../utilities/memory-store";
import { mountCanvas } from "./canvas-wrapper";

function createIcon(): Element {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

describe("mountCanvas", () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("adds the canvas to the container and removes it on unmount", () => {
    const container = document.createElement("div");

    const canvas = mountCanvas(container);
    expect(container.querySelector(".canvas-root")).not.toBeNull();

    canvas.unmount();
    expect(container.children).toHaveLength(0);
  });

  it("throws when the container already has a canvas", () => {
    const container = document.createElement("div");
    mountCanvas(container);

    expect(() => mountCanvas(container)).toThrow(
      "This container already has a canvas."
    );
  });

  it("can mount again after unmounting", () => {
    const container = document.createElement("div");

    mountCanvas(container).unmount();
    mountCanvas(container);

    expect(container.querySelectorAll(".canvas-root")).toHaveLength(1);
  });

  it("doesn't take a control in the old form, named by its action", () => {
    const container = document.createElement("div");

    expect(() =>
      mountCanvas(container, {
        toolbar: [
          [
            {
              action: "select",
              icon: createIcon(),
            } as unknown as ToolbarControl,
          ],
        ],
      })
    ).toThrow();
  });

  it("puts down a saved tool that isn't on a toolbar for the pencil", () => {
    const button = (tool: "eraser" | "pencil") =>
      (tool === "eraser" ? eraserTool : pencilTool)(createIcon());
    const container = document.createElement("div");
    let settings: unknown;
    const onSettingsChange = (changed: unknown) => {
      settings = changed;
    };
    const first = mountCanvas(container, {
      onSettingsChange,
      toolbar: [[button("pencil"), button("eraser")]],
    });
    container.querySelector<HTMLElement>('[aria-label="Eraser"]')!.click();
    first.unmount();

    // Saved, it's picked again while it's on the toolbar.
    const second = mountCanvas(container, {
      settings: JSON.parse(JSON.stringify(settings)),
      toolbar: [[button("pencil"), button("eraser")]],
    });
    expect(
      container
        .querySelector('[aria-label="Eraser"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");
    second.unmount();

    mountCanvas(container, {
      settings,
      toolbar: [[button("pencil")]],
    });

    expect(
      container
        .querySelector('[aria-label="Pencil"]')!
        .getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("reports the background as it mounts and when it's set", () => {
    const container = document.createElement("div");
    const onBackgroundChange = vi.fn();

    const canvas = mountCanvas(container, { onBackgroundChange });
    expect(onBackgroundChange).toHaveBeenCalledTimes(1);

    canvas.setBackground("#1f2023");
    expect(onBackgroundChange).toHaveBeenLastCalledWith("#1f2023");
    // Setting the same one again changes nothing.
    canvas.setBackground("#1f2023");
    expect(onBackgroundChange).toHaveBeenCalledTimes(2);
  });

  it("throws for a background that isn't a solid color", () => {
    const canvas = mountCanvas(document.createElement("div"));

    expect(() => canvas.setBackground("transparent")).toThrow(
      `"transparent" isn't a solid color.`
    );
  });

  it("has no toolbar unless it's given one", () => {
    const container = document.createElement("div");

    mountCanvas(container);

    expect(container.querySelector(".canvas-toolbar")).toBeNull();
  });

  it("shows the toolbar's controls in their groups, in order", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      toolbar: [
        [undoButton(createIcon()), redoButton(createIcon())],
        [colorControl()],
      ],
    });

    const groups = container.querySelectorAll(
      ".canvas-toolbar > .canvas-toolbar-group"
    );
    expect(groups).toHaveLength(2);
    const labels = [
      ...container.querySelectorAll(".canvas-toolbar button"),
    ].map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual(["Undo", "Redo", "Color: Black"]);
  });

  it("copies an icon, so it can be used again", () => {
    const icon = createIcon();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const toolbar = [[undoButton(icon)]];

    mountCanvas(first, { toolbar });
    mountCanvas(second, { toolbar });

    expect(first.querySelector(".canvas-toolbar svg")).not.toBeNull();
    expect(second.querySelector(".canvas-toolbar svg")).not.toBeNull();
    expect(icon.parentNode).toBeNull();
  });

  it.each<[string, ToolbarControl[][], string]>([
    [
      "something that isn't a control",
      [[{ action: "lasso", icon: createIcon() } as unknown as ToolbarControl]],
      "The toolbar lists something that isn't a control.",
    ],
    [
      "a control listed twice",
      [[colorControl()], [colorControl()]],
      'The toolbar lists "color" more than once.',
    ],
    [
      "an action both in the file menu and as a button",
      [[fileMenu([exportItem()])], [exportButton(createIcon())]],
      'The toolbar lists "export" more than once.',
    ],
  ])("throws for %s, before adding anything", (_, toolbar, message) => {
    const container = document.createElement("div");

    expect(() => mountCanvas(container, { toolbar })).toThrow(message);
    expect(container.children).toHaveLength(0);
  });

  it.each<[string, () => unknown, string]>([
    [
      "a button without an icon",
      () => undoButton(undefined as unknown as Element),
      'The toolbar\'s "undo" button needs an icon.',
    ],
    [
      "an empty file menu",
      () => fileMenu([]),
      "The file menu needs at least one item.",
    ],
    [
      "something the file menu can't list",
      () => fileMenu([undoButton(createIcon())] as unknown as FileMenuItem[]),
      "The file menu lists something that isn't a menu item.",
    ],
    [
      "a custom button without a label",
      () => customButton("", () => {}),
      "A custom toolbar button needs a label.",
    ],
    [
      "a custom button without an onClick",
      () => customButton("Settings", undefined as unknown as () => void),
      'The toolbar\'s "Settings" button needs an onClick.',
    ],
  ])("throws for %s as it's made", (_, make, message) => {
    expect(make).toThrow(message);
  });

  it("floats the toolbars, the top one at the top", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      topToolbar: [[exportButton(createIcon())]],
      toolbar: [[undoButton(createIcon())]],
    });

    // Not the tools' options, which are toolbars of their own.
    const [top, bottom] = container.querySelectorAll<HTMLElement>(
      ".canvas-toolbar:not(.canvas-tool-options)"
    );
    expect(top.dataset.position).toBe("top");
    expect(top.querySelector("button")!.getAttribute("aria-label")).toBe(
      "Export"
    );
    expect(bottom.dataset.position).toBe("bottom");
  });

  it("puts the top right toolbar in the corner, beside the status", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      topRightToolbar: [[zoomControl()]],
    });

    const corner = container.querySelector(".canvas-corner")!;
    expect(corner.querySelector(".canvas-status")).not.toBeNull();
    const toolbar = corner.querySelector<HTMLElement>(".canvas-toolbar")!;
    expect(toolbar.dataset.position).toBe("top");
    expect(
      toolbar.querySelector('[aria-label="Zoom: 100%"]')!.textContent
    ).toBe("100%");
  });

  it("starts the top right toolbar with who's here, hidden while nobody is", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      topRightToolbar: [[zoomControl()]],
    });

    const toolbar = container.querySelector(".canvas-corner .canvas-toolbar")!;
    const presence = toolbar.firstElementChild as HTMLElement;
    expect(presence.matches(".canvas-presence")).toBe(true);
    expect(presence.hidden).toBe(true);
  });

  it("throws for a control on two toolbars", () => {
    const container = document.createElement("div");

    expect(() =>
      mountCanvas(container, {
        toolbar: [[zoomControl()]],
        topRightToolbar: [[zoomControl()]],
      })
    ).toThrow('The toolbar lists "zoom" more than once.');
  });

  it("hides and shows the toolbars with Ctrl+\\ or Cmd+\\", () => {
    const container = document.createElement("div");
    const canvas = mountCanvas(container, {
      toolbar: [[undoButton(createIcon())]],
    });
    const root = container.querySelector(".canvas-root")!;
    const press = (init: KeyboardEventInit) =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Backslash", ...init })
      );

    press({ ctrlKey: true });
    expect(root.hasAttribute("data-toolbars-hidden")).toBe(true);
    press({ metaKey: true });
    expect(root.hasAttribute("data-toolbars-hidden")).toBe(false);
    // Without Ctrl or Cmd, it's typing.
    press({});
    expect(root.hasAttribute("data-toolbars-hidden")).toBe(false);

    // Unmounting stops listening.
    canvas.unmount();
    press({ ctrlKey: true });
    expect(root.hasAttribute("data-toolbars-hidden")).toBe(false);
  });

  it("checks both toolbars together", () => {
    const container = document.createElement("div");
    const newCanvas = newCanvasButton(createIcon());
    const history = historyButton(createIcon());

    expect(() =>
      mountCanvas(container, {
        topToolbar: [[newCanvas]],
        toolbar: [[history]],
      })
    ).not.toThrow();
    expect(() =>
      mountCanvas(document.createElement("div"), {
        topToolbar: [[newCanvas, history]],
        toolbar: [[history]],
      })
    ).toThrow('The toolbar lists "history" more than once.');
  });

  it("shows the file menu as a File button", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      topToolbar: [[fileMenu([newCanvasItem(), historyItem()])]],
    });

    const buttons = container.querySelectorAll(".canvas-toolbar button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("File");
  });

  // Opens the file menu's Rename dialog, and returns its name field.
  function openRename(container: HTMLElement): HTMLInputElement {
    container
      .querySelector<HTMLButtonElement>(".canvas-toolbar button")!
      .click();
    [...container.querySelectorAll<HTMLButtonElement>(".canvas-menu-item")]
      .find((item) => item.textContent === "Rename")!
      .click();
    return container.querySelector<HTMLInputElement>(".canvas-text-input")!;
  }

  it("renames from the file menu, telling the host the name", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onNameChange = vi.fn();

    mountCanvas(container, {
      onNameChange,
      topToolbar: [[fileMenu([renameItem()])]],
    });
    expect(onNameChange).toHaveBeenCalledExactlyOnceWith("");

    const input = openRename(container);
    expect(input.value).toBe("");
    input.value = "  Sunset ";
    input.form!.requestSubmit();

    expect(onNameChange).toHaveBeenLastCalledWith("Sunset");
    expect(onNameChange).toHaveBeenCalledTimes(2);
    // It starts from the current name next time.
    expect(openRename(container).value).toBe("Sunset");
  });

  it("leaves the name as it was when renaming is cancelled", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onNameChange = vi.fn();
    mountCanvas(container, {
      onNameChange,
      topToolbar: [[fileMenu([renameItem()])]],
    });

    const input = openRename(container);
    input.value = "Sunset";
    [...container.querySelectorAll<HTMLButtonElement>(".canvas-button")]
      .find((button) => button.textContent === "Cancel")!
      .click();

    expect(container.querySelector(".canvas-text-input")).toBeNull();
    expect(onNameChange).toHaveBeenCalledOnce();
  });

  it("shows the host's own buttons, which it calls when clicked", () => {
    const container = document.createElement("div");
    const onSettings = vi.fn();
    const onHelp = vi.fn();

    mountCanvas(container, {
      topToolbar: [
        [
          fileMenu([exportItem()]),
          customButton("Settings", onSettings),
          customButton("Help", onHelp),
        ],
      ],
    });

    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".canvas-toolbar button"
      ),
    ];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "File",
      "Settings",
      "Help",
    ]);
    buttons[1].click();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("says when changes couldn't be saved, and saves them with the next", async () => {
    const container = document.createElement("div");
    const store = createMemoryStore();
    const saveCanvas = vi
      .spyOn(store, "saveCanvas")
      .mockRejectedValueOnce(new Error("Offline"));

    const canvas = mountCanvas(container, { store });
    canvas.setBackground("#1f2023");

    expect(await canvas.whenSaved()).toBe(false);
    const status = container.querySelector<HTMLElement>(".canvas-status")!;
    expect(status.hasAttribute("data-shown")).toBe(true);
    expect(status.textContent).toBe("Couldn't save changes");

    canvas.setBackground("#000000");
    expect(await canvas.whenSaved()).toBe(true);
    expect(status.hasAttribute("data-shown")).toBe(false);
    expect(saveCanvas).toHaveBeenCalledTimes(2);
  });

  it("opens the canvas it's given from the store, and saves it as it changes", async () => {
    const container = document.createElement("div");
    const store = createMemoryStore();
    await store.saveCanvas({
      id: "a",
      name: "Sunset",
      updatedAt: 1,
      drawing: { background: "#1f2023" },
      viewport: null,
    });
    const onNameChange = vi.fn();
    const onOpenCanvas = vi.fn();

    const canvas = mountCanvas(container, {
      store,
      canvasId: "a",
      onNameChange,
      onOpenCanvas,
    });
    // It can't be drawn on until it's loaded.
    expect(
      container.querySelector(".canvas-root[data-loading]")
    ).not.toBeNull();
    await canvas.whenSaved();

    expect(container.querySelector(".canvas-root[data-loading]")).toBeNull();
    expect(canvas.canvasId).toBe("a");
    expect(onNameChange).toHaveBeenLastCalledWith("Sunset");
    expect(onOpenCanvas).toHaveBeenCalledWith("a");

    canvas.setBackground("#000000");
    await canvas.whenSaved();
    const saved = (await store.loadCanvas("a"))!;
    expect(saved.name).toBe("Sunset");
    expect((saved.drawing as { background: string }).background).toBe(
      "#000000"
    );
    expect(saved.updatedAt).toBeGreaterThan(1);
  });

  it("doesn't save a blank canvas until it's changed", async () => {
    const container = document.createElement("div");
    const store = createMemoryStore();
    const saveCanvas = vi.spyOn(store, "saveCanvas");

    const canvas = mountCanvas(container, { store, canvasId: "new" });
    await canvas.whenSaved();

    expect(saveCanvas).not.toHaveBeenCalled();
    expect(canvas.canvasId).toBe("new");
  });

  it("says when the canvas couldn't be opened, and saves nothing over it", async () => {
    const container = document.createElement("div");
    const store: CanvasStore = {
      ...createMemoryStore(),
      loadCanvas: () => Promise.reject(new Error("Offline")),
    };
    const saveCanvas = vi.spyOn(store, "saveCanvas");

    const canvas = mountCanvas(container, { store, canvasId: "a" });

    expect(await canvas.whenSaved()).toBe(false);
    canvas.setBackground("#000000");
    await canvas.whenSaved();
    expect(saveCanvas).not.toHaveBeenCalled();
    expect(container.querySelector(".canvas-status")!.textContent).toBe(
      "Couldn't open this canvas"
    );
  });

  it("needs a store that lists and deletes canvases for History", () => {
    const container = document.createElement("div");
    const { listCanvases: _, ...store } = createMemoryStore();

    expect(() =>
      mountCanvas(container, {
        store,
        topToolbar: [[historyButton(createIcon())]],
      })
    ).toThrow();
  });

  it("shows no status while changes are saved", () => {
    const container = document.createElement("div");

    mountCanvas(container);

    const status = container.querySelector<HTMLElement>(".canvas-status")!;
    expect(status.hasAttribute("data-shown")).toBe(false);
  });

  it("stacks a canvas saved before it had an order as it was, and saves one", async () => {
    const set = (part: string, value: unknown) =>
      localStorage.setItem(`old:canvas:a:${part}`, JSON.stringify(value));
    localStorage.setItem(
      "old:canvases",
      JSON.stringify([{ id: "a", name: "", updatedAt: 1 }])
    );
    localStorage.setItem("old:open", JSON.stringify("a"));
    set("strokes", [{ color: "#000000", points: [{ x: 1, y: 1 }], size: 2 }]);
    set("notes", [
      {
        id: "n",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: "#fefe99",
        text: "Old",
      },
    ]);
    const container = document.createElement("div");

    const canvas = mountCanvas(container, savedLocally("old"));
    await canvas.whenSaved();

    const zIndex = (selector: string) =>
      Number(container.querySelector<HTMLElement>(selector)!.style.zIndex);
    expect(zIndex(".canvas-note")).toBeGreaterThan(zIndex(".canvas-drawing"));
    expect(JSON.parse(localStorage.getItem("old:canvas:a:order")!)).toEqual([
      { kind: "strokes", count: 1 },
      { kind: "notes", id: "n" },
    ]);
    localStorage.clear();
  });
});
