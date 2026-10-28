import { describe, expect, it, vi } from "vitest";
import { type RichText } from "../../models/rich-text.model";
import { plainTextEditor } from "./plain-text-editor";

const FORMATTED: RichText = [
  { align: "center", runs: [{ text: "Hi", bold: true }] },
  { runs: [{ text: "there" }] },
];

function create(content = FORMATTED, onUpdate = vi.fn()) {
  const editor = plainTextEditor(content, {
    className: "canvas-text-text",
    label: "Text",
    onUpdate,
  });
  document.body.append(editor.element);
  return editor;
}

function type(editor: ReturnType<typeof create>, value: string) {
  const text = editor.element.querySelector("textarea")!;
  text.value = value;
  text.dispatchEvent(new Event("input"));
}

describe("plainTextEditor", () => {
  it("shows the text without its formatting", () => {
    const editor = create();

    expect(editor.element.querySelector("textarea")!.value).toBe("Hi\nthere");
    expect(editor.formatting).toBeUndefined();
  });

  it("keeps the formatting of text that isn't changed", () => {
    const editor = create();

    editor.edit();
    editor.stopEditing();

    expect(editor.content).toBe(FORMATTED);
  });

  it("makes changed text plain paragraphs, and says it changed", () => {
    const onUpdate = vi.fn();
    const editor = create(FORMATTED, onUpdate);

    editor.edit();
    type(editor, "one\ntwo");

    expect(onUpdate).toHaveBeenCalled();
    expect(editor.content).toEqual([
      { runs: [{ text: "one" }] },
      { runs: [{ text: "two" }] },
    ]);
  });

  it("is only typed in while editing", () => {
    const editor = create();
    const text = editor.element.querySelector("textarea")!;

    expect(editor.isEditable).toBe(false);
    editor.edit();
    expect(editor.isEditable).toBe(true);
    expect(document.activeElement).toBe(text);
    editor.stopEditing();
    expect(editor.element.hasAttribute("data-editable")).toBe(false);
  });

  it("ignores new content while typing", () => {
    const editor = create();
    editor.edit();
    type(editor, "typed");

    editor.setContent([{ runs: [{ text: "undone" }] }]);

    expect(editor.content).toEqual([{ runs: [{ text: "typed" }] }]);
  });
});
