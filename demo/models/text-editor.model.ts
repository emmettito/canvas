import {
  type FontName,
  type ListType,
  type RichText,
  type TextAlign,
} from "@emmettito/canvas";

// Formatting that's on or off.
export type ToggleMark = "bold" | "italic" | "underline" | "strike";

// Formatting with a value.
export type ValueMark = "font" | "size" | "color";

/** How the text at the cursor, or across the selection, is formatted. */
export interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  // Undefined where it's the note's or text box's own, and null if the
  // selection has more than one.
  font?: FontName | null;
  size?: number | null;
  color?: string | null;
  // Null if the selected paragraphs are aligned differently.
  align: TextAlign | null;
  // The list every selected paragraph is an item of, or null if they
  // aren't all items of one kind.
  list: ListType | null;
  // Where the text at the cursor, or all of the selection, links to, if it
  // does.
  link?: string;
}

/**
 * What an editor that formats text does for the canvas's format bar. Each
 * change applies to the selection, or to what's typed next if nothing is
 * selected.
 */
export interface TextFormatting {
  getFormat: () => Format;
  toggle: (mark: ToggleMark) => void;
  /** Sets a font, size or color, or goes back to the text's own if undefined. */
  setValue: (mark: ValueMark, value: string | number | undefined) => void;
  setAlign: (align: TextAlign) => void;
  /**
   * Makes each selected paragraph an item of a `list`, or no list's with
   * null, or if they're all its items already.
   */
  setList: (list: ListType | null) => void;
  /** Nests the selected list items one further in, or out. */
  indent: (step: 1 | -1) => void;
  /**
   * Links the selection, or the link at the cursor, to `href`, or unlinks it
   * if undefined. With nothing selected and no link there, `href` is added
   * as its own text.
   */
  setLink: (href: string | undefined) => void;
}

/**
 * Shows a note's or text box's text, and is typed in. It's only editable
 * while it's being typed in, so pressing the text otherwise drags its note or
 * text box.
 */
export interface TextEditor {
  readonly element: HTMLElement;
  /** The text as it is now, including what's being typed. */
  readonly content: RichText;
  readonly isEditable: boolean;
  /** Replaces the text, e.g. once it's undone. Ignored while typing. */
  setContent: (content: RichText) => void;
  /** Starts typing, with the cursor at the end. */
  edit: () => void;
  stopEditing: () => void;
  focus: () => void;
  destroy: () => void;
  /** Present if it formats text, which shows the format bar while typing. */
  readonly formatting?: TextFormatting;
}

export interface TextEditorOptions {
  // For the editor's element, which the canvas's styles use.
  className: string;
  // What screen readers call it.
  label: string;
  // Called when the text, or the formatting at the cursor, changes.
  onUpdate: () => void;
}

/**
 * Makes the editor a note or text box shows its text with. The canvas's own
 * edits plain text. `@emmettito/canvas/prosemirror` formats it.
 */
export type TextEditorFactory = (
  content: RichText,
  options: TextEditorOptions
) => TextEditor;
