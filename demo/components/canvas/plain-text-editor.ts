import { type RichText, fromPlainText, toPlainText } from "@emmettito/canvas";
import {
  type TextEditor,
  type TextEditorFactory,
  type TextEditorOptions,
} from "../../models/text-editor.model";
import { createElement } from "../../utilities/create-element";

/*
 * Plain text in a text box. A hidden copy of the text, in the element's
 * `data-value`, sizes the element to fit it, and the text box covers it, so a
 * text box's own default size doesn't count. Formatting from another editor
 * isn't shown, and is kept unless the text is changed.
 */
class PlainTextEditor implements TextEditor {
  readonly element: HTMLElement;
  #text = createElement("textarea", "canvas-plain-text");
  #content: RichText;
  #editable = false;

  constructor(
    content: RichText,
    { className, label, onUpdate }: TextEditorOptions
  ) {
    this.element = createElement("div", className);
    this.element.dataset.plainText = "";
    this.#content = content;
    const text = this.#text;
    text.setAttribute("aria-label", label);
    text.tabIndex = -1;
    text.addEventListener("input", () => {
      this.element.dataset.value = text.value;
      onUpdate();
    });
    this.element.append(text);
    this.#show(content);
  }

  get content(): RichText {
    // Unchanged text keeps any formatting it had.
    const value = this.#text.value;
    return value === toPlainText(this.#content)
      ? this.#content
      : fromPlainText(value);
  }

  get isEditable(): boolean {
    return this.#editable;
  }

  setContent(content: RichText): void {
    if (this.#editable || content === this.#content) {
      return;
    }
    this.#content = content;
    this.#show(content);
  }

  edit(): void {
    this.#editable = true;
    this.element.toggleAttribute("data-editable", true);
    this.#text.tabIndex = 0;
    this.#text.focus();
    const end = this.#text.value.length;
    this.#text.setSelectionRange(end, end);
  }

  stopEditing(): void {
    this.#content = this.content;
    this.#editable = false;
    this.element.removeAttribute("data-editable");
    this.#text.tabIndex = -1;
    // Text past a note's bottom isn't shown, so it shows its start again.
    this.#text.scrollTop = 0;
  }

  focus(): void {
    this.#text.focus();
  }

  destroy(): void {}

  #show(content: RichText): void {
    const value = toPlainText(content);
    this.#text.value = value;
    this.element.dataset.value = value;
  }
}

/** Edits notes' and text boxes' text as plain text. */
export const plainTextEditor: TextEditorFactory = (content, options) =>
  new PlainTextEditor(content, options);
