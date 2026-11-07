// A color from the page's palette, by the name the page gives it, e.g.
// "red". The library doesn't know the palette: the page says which names are
// in it, and what each looks like, so what's drawn follows it.
export type PaletteColor = string;

// A color picked outside the palette, as "#rrggbb", e.g. "#ff8800".
export type CustomColor = `#${string}`;

// What a tool draws in: a palette color or a custom one.
export type ToolColor = PaletteColor | CustomColor;
