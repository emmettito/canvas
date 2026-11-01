import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  type Mark,
  type MarkType,
  type Node,
  type ResolvedPos,
  Schema,
} from "prosemirror-model";
import {
  type Command,
  EditorState,
  Plugin,
  Selection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { FONTS } from "../../constants/fonts.const";
import {
  type FontName,
  type ListType,
  type Paragraph,
  type RichText,
  type TextAlign,
  type TextRun,
} from "../../models/rich-text.model";
import { LIST_INDENT } from "../../utilities/lay-out-rich-text";
import {
  getListMarkers,
  isLinkAddress,
  MAX_LIST_LEVEL,
} from "../../utilities/rich-text";
import {
  type Format,
  type TextEditor,
  type TextEditorFactory,
  type TextEditorOptions,
  type TextFormatting,
  type ToggleMark,
  type ValueMark,
} from "../../models/text-editor.model";

// Shortcuts use Cmd on a Mac, and Ctrl elsewhere.
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

// The one value in `values`, or null if there's more than one.
function getOnly<T>(values: Set<T>): T | null {
  return values.size === 1 ? [...values][0] : null;
}

// The names a list's DOM gives it, and its level, read back.
function readList(dom: HTMLElement): { list: ListType | null; level: number } {
  const list = dom.dataset.list;
  if (list !== "bullet" && list !== "ordered") {
    return { list: null, level: 0 };
  }
  const level = Number(dom.dataset.level);
  return {
    list,
    level: Number.isInteger(level)
      ? Math.min(Math.max(level, 0), MAX_LIST_LEVEL)
      : 0,
  };
}

/*
 * The editor's document: paragraphs of text, each with an alignment, which
 * can be items of a bulleted or numbered list, nested a level or more in.
 * A list is the items next to each other, so there are no list nodes to
 * keep in order. Its formatting marks copy and paste between notes and text
 * boxes, through their `data-` attributes. Text pasted from elsewhere keeps
 * only bold, italic, underline, lines through and links.
 */
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "text*",
      attrs: {
        align: { default: "left" },
        list: { default: null },
        level: { default: 0 },
      },
      parseDOM: [
        {
          tag: "p",
          getAttrs: (dom) => ({
            align: ["center", "right"].includes(dom.style.textAlign)
              ? dom.style.textAlign
              : "left",
            ...readList(dom),
          }),
        },
      ],
      // A list item is indented a step for each level, and one more, for its
      // marker, which the decorations add.
      toDOM: (node) => {
        const { align, list, level } = node.attrs;
        const styles = align === "left" ? [] : [`text-align: ${align}`];
        if (list) {
          styles.push(`padding-left: ${(level + 1) * LIST_INDENT}em`);
        }
        return [
          "p",
          {
            ...(list && { "data-list": list, "data-level": String(level) }),
            ...(styles.length > 0 && { style: styles.join("; ") }),
          },
          0,
        ];
      },
    },
    text: {},
  },
  marks: {
    // Outside the rest, so a link with formatting inside it is one link.
    // Typing at its end doesn't carry it on.
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom) => {
            const href = dom.getAttribute("href") ?? "";
            return isLinkAddress(href) ? { href } : false;
          },
        },
      ],
      toDOM: (mark) => [
        "a",
        {
          href: mark.attrs.href,
          title: `${mark.attrs.href}\n${IS_MAC ? "⌘" : "Ctrl"}-click to open`,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
        0,
      ],
    },
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
  const paragraphs = (
    content.length > 0 ? content : [{ runs: [] } as Paragraph]
  ).map(({ align = "left", list, level = 0, runs }) =>
    schema.nodes.paragraph.create(
      { align, list: list ?? null, level: list ? level : 0 },
      runs
        .filter(({ text }) => text !== "")
        .map((run) => schema.text(run.text, toMarks(run)))
    )
  );
  return schema.nodes.doc.create(null, paragraphs);
}

function toMarks(run: TextRun): Mark[] {
  const marks: Mark[] = [];
  // A peer's link could go anywhere, so only one that can is kept.
  if (run.link && isLinkAddress(run.link)) {
    marks.push(schema.marks.link.create({ href: run.link }));
  }
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
    const name = mark.type.name as ToggleMark | ValueMark | "link";
    if (name === "link") {
      run.link = mark.attrs.href as string;
    } else if ((TOGGLE_MARKS as string[]).includes(name)) {
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
    const { align, list, level } = paragraph.attrs as {
      align: TextAlign;
      list: ListType | null;
      level: number;
    };
    paragraphs.push({
      ...(align !== "left" && { align }),
      ...(list && { list, ...(level > 0 && { level }) }),
      runs,
    });
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

// Each paragraph from `from` to `to`, with where it starts.
function getParagraphs(
  doc: Node,
  from: number,
  to: number
): { node: Node; position: number }[] {
  const paragraphs: { node: Node; position: number }[] = [];
  doc.nodesBetween(from, to, (node, position) => {
    if (node.type === schema.nodes.paragraph) {
      paragraphs.push({ node, position });
      return false;
    }
    return true;
  });
  return paragraphs;
}

// Makes each selected paragraph an item of `list`, or no list's.
function setList(list: ListType | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const paragraphs = getParagraphs(state.doc, from, to);
    const all = paragraphs.every(({ node }) => node.attrs.list === list);
    const next = all ? null : list;
    if (dispatch) {
      const transaction = state.tr;
      for (const { node, position } of paragraphs) {
        transaction.setNodeMarkup(position, undefined, {
          ...node.attrs,
          list: next,
          level: next ? node.attrs.level : 0,
        });
      }
      dispatch(transaction);
    }
    return true;
  };
}

// Nests the selected list items a level further in, or out, and out of the
// list from its first level. Nothing happens outside a list, e.g. so Tab
// moves focus as usual.
function indent(step: 1 | -1): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const items = getParagraphs(state.doc, from, to).filter(
      ({ node }) => node.attrs.list
    );
    if (items.length === 0) {
      return false;
    }
    if (dispatch) {
      const transaction = state.tr;
      for (const { node, position } of items) {
        const level = (node.attrs.level as number) + step;
        transaction.setNodeMarkup(
          position,
          undefined,
          level < 0
            ? { ...node.attrs, list: null, level: 0 }
            : { ...node.attrs, level: Math.min(level, MAX_LIST_LEVEL) }
        );
      }
      dispatch(transaction);
    }
    return true;
  };
}

// Enter starts a new paragraph like the one it's in, e.g. the next item of
// its list, or aligned the same. In an empty item, it goes a level out
// instead, and out of the list from its first level, as in a word
// processor.
const splitParagraph: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const paragraph = $from.parent;
  if (empty && paragraph.attrs.list && paragraph.content.size === 0) {
    return indent(-1)(state, dispatch);
  }
  if (dispatch) {
    const transaction = state.tr;
    if (!empty) {
      transaction.deleteSelection();
    }
    const at = transaction.selection.$from;
    const marks = state.storedMarks ?? at.marks();
    transaction.split(at.pos, 1, [
      { type: schema.nodes.paragraph, attrs: at.parent.attrs },
    ]);
    // What's typed next looks like what was before it, but isn't linked.
    transaction.ensureMarks(schema.marks.link.removeFromSet(marks));
    dispatch(transaction.scrollIntoView());
  }
  return true;
};

// Backspace at the start of a list item takes it out of the list, keeping
// its text, before it joins the paragraph above.
const leaveList: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const paragraph = $from.parent;
  if (!empty || $from.parentOffset > 0 || !paragraph.attrs.list) {
    return false;
  }
  if (dispatch) {
    dispatch(
      state.tr.setNodeMarkup($from.before(), undefined, {
        ...paragraph.attrs,
        list: null,
        level: 0,
      })
    );
  }
  return true;
};

// Starting a paragraph with "- " or "* " makes it a bulleted list's item,
// and "1. " a numbered one's, as in Markdown.
function startListAsTyped(
  view: EditorView,
  from: number,
  to: number,
  text: string
): boolean {
  const { state } = view;
  const { $from } = state.selection;
  if (text !== " " || from !== to || $from.parent.attrs.list) {
    return false;
  }
  const before = $from.parent.textBetween(0, $from.parentOffset);
  const list: ListType | null = /^[-*•]$/.test(before)
    ? "bullet"
    : /^1[.)]$/.test(before)
      ? "ordered"
      : null;
  if (!list) {
    return false;
  }
  const start = $from.start();
  view.dispatch(
    state.tr
      .delete(start, start + before.length)
      .setNodeMarkup($from.before(), undefined, {
        ...$from.parent.attrs,
        list,
        level: 0,
      })
  );
  return true;
}

// Each list item's bullet or number, as an attribute its paragraph's marker
// shows.
const listMarkers = new Plugin({
  props: {
    decorations: (state) => {
      const paragraphs: { node: Node; position: number }[] = [];
      state.doc.forEach((node, position) =>
        paragraphs.push({ node, position })
      );
      const markers = getListMarkers(
        paragraphs.map(({ node }) => ({
          list: node.attrs.list ?? undefined,
          level: node.attrs.level,
          runs: [],
        }))
      );
      return DecorationSet.create(
        state.doc,
        paragraphs.flatMap(({ node, position }, index) => {
          const marker = markers[index];
          return marker
            ? [
                Decoration.node(position, position + node.nodeSize, {
                  "data-marker": marker,
                }),
              ]
            : [];
        })
      );
    },
  },
});

// Where the link `type` at `$pos` reaches, either side of it, in its
// paragraph, or null if there's none there.
function getLinkRange(
  $pos: ResolvedPos,
  href: string
): { from: number; to: number } | null {
  const start = $pos.start();
  const offset = $pos.parentOffset;
  let range: { from: number; to: number } | null = null;
  let run: { from: number; to: number } | null = null;
  $pos.parent.forEach((child, childOffset) => {
    const linked = child.marks.some(
      (mark) => mark.type === schema.marks.link && mark.attrs.href === href
    );
    const end = childOffset + child.nodeSize;
    if (!linked) {
      run = null;
      return;
    }
    run = run ? { from: run.from, to: end } : { from: childOffset, to: end };
    if (run.from <= offset && offset <= run.to) {
      range = { from: start + run.from, to: start + run.to };
    }
  });
  return range;
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
    // Links open in a new tab with Cmd (Ctrl elsewhere) held, since a click
    // types, or drags the note or text box.
    this.element.addEventListener("click", (event) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!link) {
        return;
      }
      event.preventDefault();
      const href = link.getAttribute("href") ?? "";
      if ((IS_MAC ? event.metaKey : event.ctrlKey) && isLinkAddress(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });
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
    // A link's value is where it goes.
    const read = (mark: Mark | undefined) =>
      mark?.type === schema.marks.link ? mark.attrs.href : mark?.attrs.value;
    const value = (type: MarkType): unknown => {
      if (empty) {
        return read(type.isInSet(state.storedMarks ?? $from.marks()));
      }
      const values = new Set<unknown>();
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) {
          values.add(read(type.isInSet(node.marks)));
        }
      });
      return getOnly(values);
    };
    const paragraphs = getParagraphs(state.doc, from, to);
    const aligns = new Set(
      paragraphs.map(({ node }) => node.attrs.align as TextAlign)
    );
    const lists = new Set(
      paragraphs.map(({ node }) => node.attrs.list as ListType | null)
    );
    const link = empty
      ? schema.marks.link.isInSet(state.storedMarks ?? $from.marks())?.attrs
          .href
      : isAcross(state, from, to, (marks) =>
            Boolean(schema.marks.link.isInSet(marks))
          )
        ? value(schema.marks.link)
        : undefined;
    return {
      bold: has(schema.marks.bold),
      italic: has(schema.marks.italic),
      underline: has(schema.marks.underline),
      strike: has(schema.marks.strike),
      font: value(schema.marks.font) as FontName | null | undefined,
      size: value(schema.marks.size) as number | null | undefined,
      color: value(schema.marks.color) as string | null | undefined,
      align: getOnly(aligns),
      list: getOnly(lists),
      ...(typeof link === "string" && { link }),
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

  setList = (list: ListType | null): void => {
    setList(list)(this.#view.state, this.#view.dispatch);
  };

  indent = (step: 1 | -1): void => {
    indent(step)(this.#view.state, this.#view.dispatch);
  };

  setLink = (href: string | undefined): void => {
    const { state } = this.#view;
    const { empty, from, to, $from } = state.selection;
    const type = schema.marks.link;
    const transaction = state.tr;
    if (!empty) {
      transaction.removeMark(from, to, type);
      if (href) {
        transaction.addMark(from, to, type.create({ href }));
      }
    } else {
      const current = type.isInSet(state.storedMarks ?? $from.marks());
      const range = current && getLinkRange($from, current.attrs.href);
      if (range) {
        transaction.removeMark(range.from, range.to, type);
        if (href) {
          transaction.addMark(range.from, range.to, type.create({ href }));
        }
      } else if (href) {
        // The address is its own text, which typing goes on after.
        transaction.insertText(href, from);
        transaction.addMark(from, from + href.length, type.create({ href }));
      } else {
        return;
      }
    }
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
        listMarkers,
        new Plugin({ props: { handleTextInput: startListAsTyped } }),
        keymap({
          Enter: splitParagraph,
          Backspace: leaveList,
          Tab: indent(1),
          "Shift-Tab": indent(-1),
          "Shift-Mod-7": setList("ordered"),
          "Shift-Mod-8": setList("bullet"),
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
 * typed in: its font, size, bold, italic, underline, line through, color,
 * links, lists and alignment. Pass it as `textEditor` to `mountCanvas`. It needs ProseMirror's
 * packages, which the canvas otherwise doesn't.
 */
export const proseMirrorEditor: TextEditorFactory = (content, options) =>
  new ProseMirrorEditor(content, options);
