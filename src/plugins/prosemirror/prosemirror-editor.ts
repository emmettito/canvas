import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { type Mark, type MarkType, type Node, Schema } from "prosemirror-model";
import { EditorState, Selection, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { FONTS } from "../../constants/fonts.const";
import {
  type FontName,
  type Paragraph,
  type RichText,
  type TextAlign,
  type TextRun,
} from "../../models/rich-text.model";
import {
  type Format,
  type TextEditor,
  type TextEditorFactory,
  type TextEditorOptions,
  type TextFormatting,
  type ToggleMark,
  type ValueMark,
} from "../../models/text-editor.model";

// The one value in `values`, or null if there's more than one.
function getOnly<T>(values: Set<T>): T | null {
  return values.size === 1 ? [...values][0] : null;
}

/*
 * The editor's document: paragraphs of text, each with an alignment. Its
 * formatting marks copy and paste between notes and text boxes, through their
 * `data-` attributes. Text pasted from elsewhere keeps only bold, italic,
 * underline and lines through.
 */
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "text*",
      attrs: { align: { default: "left" } },
      parseDOM: [
        {
          tag: "p",
          getAttrs: (dom) => ({
            align: ["center", "right"].includes(dom.style.textAlign)
              ? dom.style.textAlign
              : "left",
          }),
        },
      ],
      toDOM: (node) => [
        "p",
        node.attrs.align === "left"
          ? {}
          : { style: `text-align: ${node.attrs.align}` },
        0,
      ],
    },
    text: {},
  },
  marks: {
    bold: {
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
      toDOM: () => ["strong", 0],
    },
    italic: {
      parseDOM: [{ tag: "em" }, { tag: "i" }],
      toDOM: () => ["em", 0],
    },
    underline: { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] },
    strike: {
      parseDOM: [{ tag: "s" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },
    font: {
      attrs: { value: {} },
      parseDOM: [
        {
          tag: "span[data-font]",
          getAttrs: (dom) =>
            Object.hasOwn(FONTS, dom.dataset.font ?? "")
              ? { value: dom.dataset.font }
              : false,
        },
      ],
      toDOM: (mark) => [
        "span",
        {
          "data-font": mark.attrs.value,
          style: `font-family: ${FONTS[mark.attrs.value as FontName].family}`,
        },
        0,
      ],
    },
    size: {
      attrs: { value: {} },
      parseDOM: [
        {
          tag: "span[data-size]",
          getAttrs: (dom) => {
            const value = Number(dom.dataset.size);
            return value > 0 ? { value } : false;
          },
        },
      ],
      toDOM: (mark) => [
        "span",
        {
          "data-size": mark.attrs.value,
          style: `font-size: ${mark.attrs.value}px`,
        },
        0,
      ],
    },
    color: {
      attrs: { value: {} },
      parseDOM: [
        {
          tag: "span[data-color]",
          getAttrs: (dom) => ({ value: dom.dataset.color }),
        },
      ],
      toDOM: (mark) => [
        "span",
        { "data-color": mark.attrs.value, style: `color: ${mark.attrs.value}` },
        0,
      ],
    },
  },
});

const TOGGLE_MARKS: ToggleMark[] = ["bold", "italic", "underline", "strike"];
const VALUE_MARKS: ValueMark[] = ["font", "size", "color"];

function toDoc(content: RichText): Node {
  const paragraphs = (content.length > 0 ? content : [{ runs: [] }]).map(
    ({ align = "left", runs }) =>
      schema.nodes.paragraph.create(
        { align },
        runs
          .filter(({ text }) => text !== "")
          .map((run) => schema.text(run.text, toMarks(run)))
      )
  );
  return schema.nodes.doc.create(null, paragraphs);
}

function toMarks(run: TextRun): Mark[] {
  const marks: Mark[] = [];
  for (const name of TOGGLE_MARKS) {
    if (run[name]) {
      marks.push(schema.marks[name].create());
    }
  }
  for (const name of VALUE_MARKS) {
    if (run[name] !== undefined) {
      marks.push(schema.marks[name].create({ value: run[name] }));
    }
  }
  return marks;
}

function toRun(node: Node): TextRun {
  const run: TextRun = { text: node.text ?? "" };
  for (const mark of node.marks) {
    const name = mark.type.name as ToggleMark | ValueMark;
    if ((TOGGLE_MARKS as string[]).includes(name)) {
      run[name as ToggleMark] = true;
    } else {
      (run as Record<ValueMark, unknown>)[name as ValueMark] = mark.attrs.value;
    }
  }
  return run;
}

function fromDoc(doc: Node): RichText {
  const paragraphs: Paragraph[] = [];
  doc.forEach((paragraph) => {
    const runs: TextRun[] = [];
    paragraph.forEach((node) => runs.push(toRun(node)));
    const align = paragraph.attrs.align as TextAlign;
    paragraphs.push(align === "left" ? { runs } : { align, runs });
  });
  return paragraphs;
}

// Sets a value mark on the selection, or for what's typed next if nothing is
// selected. Undefined removes it, so the text goes back to its own.
function setValueMark(
  type: MarkType,
  value: unknown,
  state: EditorState,
  dispatch: (transaction: Transaction) => void
): void {
  const { empty, from, to, $from } = state.selection;
  const mark = value === undefined ? null : type.create({ value });
  if (empty) {
    const marks = type.removeFromSet(state.storedMarks ?? $from.marks());
    dispatch(state.tr.setStoredMarks(mark ? mark.addToSet(marks) : marks));
    return;
  }
  const transaction = state.tr.removeMark(from, to, type);
  dispatch(mark ? transaction.addMark(from, to, mark) : transaction);
}

// Formatted text that can be typed in, which notes and text boxes show their
// text with.
class ProseMirrorEditor implements TextEditor, TextFormatting {
  readonly element: HTMLElement;
  readonly formatting: TextFormatting = this;
  #view: EditorView;
  #editable = false;
  // The content as last set or read, and the document it was read from, so
  // it's only read again once the document changes, and setting the same
  // content again doesn't reset the cursor.
  #content: RichText;
  #contentDoc: Node;

  constructor(
    content: RichText,
    { className, label, onUpdate }: TextEditorOptions
  ) {
    this.#content = content;
    this.#view = new EditorView(null, {
      state: this.#createState(content),
      editable: () => this.#editable,
      attributes: {
        class: className,
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
      dispatchTransaction: (transaction) => {
        this.#view.updateState(this.#view.state.apply(transaction));
        onUpdate();
      },
    });
    this.#contentDoc = this.#view.state.doc;
    this.element = this.#view.dom;
  }

  get content(): RichText {
    const { doc } = this.#view.state;
    if (doc !== this.#contentDoc) {
      this.#content = fromDoc(doc);
      this.#contentDoc = doc;
    }
    return this.#content;
  }

  /** Replaces the text, e.g. once it's undone, unless it's being typed in. */
  setContent(content: RichText): void {
    if (content === this.#content || this.#editable) {
      return;
    }
    this.#content = content;
    this.#view.updateState(this.#createState(content));
    this.#contentDoc = this.#view.state.doc;
  }

  get isEditable(): boolean {
    return this.#editable;
  }

  /** Starts typing, with the cursor at the end. */
  edit(): void {
    this.#editable = true;
    this.#view.setProps({});
    const { state } = this.#view;
    this.#view.dispatch(state.tr.setSelection(Selection.atEnd(state.doc)));
    this.#view.focus();
  }

  /** Stops typing, so pressing the text drags its note or text box again. */
  stopEditing(): void {
    this.#editable = false;
    this.#view.setProps({});
  }

  focus(): void {
    this.#view.focus();
  }

  getFormat = (): Format => {
    const { state } = this.#view;
    const { empty, from, to, $from } = state.selection;
    const has = (type: MarkType) =>
      empty
        ? Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
        : isAcross(state, from, to, (marks) => Boolean(type.isInSet(marks)));
    const value = (type: MarkType): unknown => {
      if (empty) {
        return type.isInSet(state.storedMarks ?? $from.marks())?.attrs.value;
      }
      const values = new Set<unknown>();
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) {
          values.add(type.isInSet(node.marks)?.attrs.value);
        }
      });
      return getOnly(values);
    };
    const aligns = new Set<TextAlign>();
    state.doc.nodesBetween(from, to, (node) => {
      if (node.type === schema.nodes.paragraph) {
        aligns.add(node.attrs.align as TextAlign);
        return false;
      }
      return true;
    });
    return {
      bold: has(schema.marks.bold),
      italic: has(schema.marks.italic),
      underline: has(schema.marks.underline),
      strike: has(schema.marks.strike),
      font: value(schema.marks.font) as FontName | null | undefined,
      size: value(schema.marks.size) as number | null | undefined,
      color: value(schema.marks.color) as string | null | undefined,
      align: getOnly(aligns),
    };
  };

  toggle = (name: ToggleMark): void => {
    toggleMark(schema.marks[name])(this.#view.state, this.#view.dispatch);
  };

  setValue = (name: ValueMark, value: string | number | undefined): void => {
    setValueMark(
      schema.marks[name],
      value,
      this.#view.state,
      this.#view.dispatch
    );
  };

  /** Aligns each paragraph in the selection. */
  setAlign = (align: TextAlign): void => {
    const { state } = this.#view;
    const { from, to } = state.selection;
    const transaction = state.tr;
    state.doc.nodesBetween(from, to, (node, position) => {
      if (node.type === schema.nodes.paragraph) {
        transaction.setNodeAttribute(position, "align", align);
        return false;
      }
      return true;
    });
    this.#view.dispatch(transaction);
  };

  destroy(): void {
    this.#view.destroy();
  }

  #createState(content: RichText): EditorState {
    return EditorState.create({
      doc: toDoc(content),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Shift-Mod-z": redo,
          "Mod-y": redo,
          "Mod-b": toggleMark(schema.marks.bold),
          "Mod-i": toggleMark(schema.marks.italic),
          "Mod-u": toggleMark(schema.marks.underline),
          "Shift-Mod-x": toggleMark(schema.marks.strike),
        }),
        keymap(baseKeymap),
      ],
    });
  }
}

// Whether `test` holds for the marks of all the text from `from` to `to`.
function isAcross(
  state: EditorState,
  from: number,
  to: number,
  test: (marks: readonly Mark[]) => boolean
): boolean {
  let all = true;
  let any = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      any = true;
      all &&= test(node.marks);
    }
  });
  return any && all;
}

/**
 * Formats the text in notes and text boxes, with a bar above it while it's
 * typed in: its font, size, bold, italic, underline, line through, color and
 * alignment. Pass it as `textEditor` to `mountCanvas`. It needs ProseMirror's
 * packages, which the canvas otherwise doesn't.
 */
export const proseMirrorEditor: TextEditorFactory = (content, options) =>
  new ProseMirrorEditor(content, options);
