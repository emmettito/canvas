import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FileMenuItem,
  type ToolbarControl,
} from "../../models/toolbar-control.model";
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
        [
          { action: "undo", icon: createIcon() },
          { action: "redo", icon: createIcon() },
        ],
        [{ action: "color" }],
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
    const toolbar = [[{ action: "undo", icon } as const]];

    mountCanvas(first, { toolbar });
    mountCanvas(second, { toolbar });

    expect(first.querySelector(".canvas-toolbar svg")).not.toBeNull();
    expect(second.querySelector(".canvas-toolbar svg")).not.toBeNull();
    expect(icon.parentNode).toBeNull();
  });

  it.each<[string, ToolbarControl[][], string]>([
    [
      "an unknown control",
      [[{ action: "lasso", icon: createIcon() } as unknown as ToolbarControl]],
      '"lasso" isn\'t a toolbar control.',
    ],
    [
      "a control listed twice",
      [[{ action: "color" }], [{ action: "color" }]],
      'The toolbar lists "color" more than once.',
    ],
    [
      "a button without an icon",
      [[{ action: "undo" } as unknown as ToolbarControl]],
      'The toolbar\'s "undo" button needs an icon.',
    ],
    [
      "an empty file menu",
      [[{ action: "file-menu", items: [] }]],
      "The file menu needs at least one item.",
    ],
    [
      "something the file menu can't list",
      [
        [
          {
            action: "file-menu",
            items: ["undo"] as unknown as FileMenuItem[],
          },
        ],
      ],
      '"undo" can\'t go in the file menu.',
    ],
    [
      "an action both in the file menu and as a button",
      [
        [{ action: "file-menu", items: ["export"] }],
        [{ action: "export", icon: createIcon() }],
      ],
      'The toolbar lists "export" more than once.',
    ],
    [
      "a custom control without a label",
      [[{ action: "custom", label: "", onClick: () => {} }]],
      "A custom toolbar control needs a label.",
    ],
    [
      "a custom control without an onClick",
      [
        [
          {
            action: "custom",
            label: "Settings",
          } as unknown as ToolbarControl,
        ],
      ],
      'The toolbar\'s "Settings" control needs an onClick.',
    ],
  ])("throws for %s, before adding anything", (_, toolbar, message) => {
    const container = document.createElement("div");

    expect(() => mountCanvas(container, { toolbar })).toThrow(message);
    expect(container.children).toHaveLength(0);
  });

  it("floats the toolbars, the top one at the top", () => {
    const container = document.createElement("div");

    mountCanvas(container, {
      topToolbar: [[{ action: "export", icon: createIcon() }]],
      toolbar: [[{ action: "undo", icon: createIcon() }]],
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
      topRightToolbar: [[{ action: "zoom" }]],
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
      topRightToolbar: [[{ action: "zoom" }]],
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
        toolbar: [[{ action: "zoom" }]],
        topRightToolbar: [[{ action: "zoom" }]],
      })
    ).toThrow('The toolbar lists "zoom" more than once.');
  });

  it("hides and shows the toolbars with Ctrl+\\ or Cmd+\\", () => {
    const container = document.createElement("div");
    const canvas = mountCanvas(container, {
      toolbar: [[{ action: "undo", icon: createIcon() }]],
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
    const newCanvas = { action: "new-canvas", icon: createIcon() } as const;
    const history = { action: "history", icon: createIcon() } as const;

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
      topToolbar: [[{ action: "file-menu", items: ["new-canvas", "history"] }]],
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
      topToolbar: [[{ action: "file-menu", items: ["rename"] }]],
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
      topToolbar: [[{ action: "file-menu", items: ["rename"] }]],
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
          { action: "file-menu", items: ["export"] },
          { action: "custom", label: "Settings", onClick: onSettings },
          { action: "custom", label: "Help", onClick: onHelp },
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

  it("says when changes couldn't be saved", () => {
    const container = document.createElement("div");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mountCanvas(container, { storageKey: "test" });

    const status = container.querySelector<HTMLElement>(".canvas-status")!;
    expect(status.hasAttribute("data-shown")).toBe(true);
    expect(status.textContent).toBe("Couldn't save changes");
    vi.restoreAllMocks();
  });

  it("shows no status while changes are saved", () => {
    const container = document.createElement("div");

    mountCanvas(container);

    const status = container.querySelector<HTMLElement>(".canvas-status")!;
    expect(status.hasAttribute("data-shown")).toBe(false);
  });

  it("stacks a canvas saved before it had an order as it was, and saves one", () => {
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

    mountCanvas(container, { storageKey: "old" });

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
