// The fonts text can be in, with the CSS font family each uses. Each falls back
// to a generic family, so text still shows wherever it's exported to. Text
// without a font is in the page's.
export const FONTS = {
  serif: { label: "Serif", family: 'Georgia, "Times New Roman", serif' },
  mono: {
    label: "Monospace",
    family: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
  },
  hand: {
    label: "Handwriting",
    family: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  },
} as const;
