import { DRAG_THRESHOLD } from "../../constants/drag-threshold.const";
import { type Point } from "../../models/point.model";
import { type ResizeHandle } from "../../models/resize-handle.model";
import { type Size } from "../../models/size.model";
import { createElement } from "../../utilities/create-element";

// How long, in milliseconds, a touch rests on an item to open its menu, like
// a right-click.
const LONG_PRESS = 500;
// How soon, in milliseconds, a second press on an item counts as a double
// press, e.g. to open a note for typing.
const DOUBLE_PRESS = 400;

// Something placed on the drawing, by its top left corner. Drawing units are
// CSS pixels on the canvas.
export interface PlacedItem {
  id: string;
  x: number;
  y: number;
}

// An item on screen.
export interface ItemView<T extends PlacedItem> {
  element: HTMLDivElement;
  // As of the last drawing, or as it's being dragged.
  item: T;
}

export interface ItemLayerOptions<T extends PlacedItem, V extends ItemView<T>> {
  // Each item's class name. Its resize handles are named after it, e.g.
  // "canvas-note-resize".
  className: string;
  // Where its resize handles are, e.g. ["se"] for one at the bottom right.
  // They can't be seen, but the pointer shows where they are.
  handles: ResizeHandle[];
  // Adds the item's content to `element`. The layer adds the resize handles
  // after it.
  createView: (item: T, element: HTMLDivElement) => V;
  // Positions the view and shows its item.
  render: (view: V) => void;
  // The item once `handle` is dragged `dx` and `dy`. `size` is how big it was
  // on screen when the drag started, and `min` the smallest it can be.
  resize: (
    from: T,
    size: Size,
    handle: ResizeHandle,
    dx: number,
    dy: number,
    min: Size
  ) => T;
  // The smallest the item can be resized to, as the drag starts, e.g. as
  // tall as its text.
  getMinSize: (view: V) => Size;
  // Screen pixels per drawing unit, so a drag moves the item as far as the
  // pointer.
  getZoom: () => number;
  // Whether pressing `target` is left to the browser, e.g. to move the caret
  // in text being typed.
  isPressForBrowser?: (view: V, target: Element) => boolean;
  // The item was pressed without being dragged. `extend` is whether Shift
  // was held, e.g. to add it to what's picked.
  onPress?: (view: V, extend: boolean) => void;
  // The item was pressed twice, or Enter was pressed on it, e.g. to type in
  // it. Without this, Enter presses it.
  onOpen?: (view: V) => void;
  // The item was right-clicked, even while it's typed in, or long-pressed,
  // at `point` on screen.
  onMenu: (view: V, point: Point) => void;
  // Its element is removed, e.g. to stop what's in it.
  destroyView?: (view: V) => void;
  // Where the item goes as it's dragged to `item`, e.g. lined up with others
  // near it. `free` is whether Alt is held, to place it exactly.
  snap?: (view: V, item: T, free: boolean) => T;
  // An item was dragged to where `view` shows it, from `from`, as it's
  // moved, or resized if `resizing`.
  onGestureMove?: (view: V, from: T, resizing: boolean) => void;
  // An item stopped being moved or resized, after the change if it was
  // kept, or put back.
  onGestureEnd?: () => void;
  // It was moved or resized.
  onChange: (item: T) => void;
  // Delete or Backspace was pressed on it. Without this, it's removed.
  onDelete?: (view: V) => void;
  onRemove: (id: string) => void;
}

// An item being moved or resized.
interface Gesture<T extends PlacedItem, V extends ItemView<T>> {
  view: V;
  // The handle being dragged, or null to move the item.
  handle: ResizeHandle | null;
  pointerId: number;
  // Where the pointer went down, in screen pixels.
  start: Point;
  // The item before the gesture, its size on screen, and the smallest it
  // can be resized to.
  from: T;
  size: Size;
  min: Size;
  moved: boolean;
}

/**
 * One kind of item placed on the drawing, e.g. the notes, shown above the
 * strokes. Dragging an item moves it, and dragging its edges resizes it.
 * Right-clicking or long-pressing it opens its menu, and an item with focus
 * is removed with Delete or Backspace.
 */
export class ItemLayer<T extends PlacedItem, V extends ItemView<T>> {
  readonly element: HTMLDivElement;
  #options: ItemLayerOptions<T, V>;
  #items: T[] = [];
  #views = new Map<string, V>();
  // An item that's shown but isn't in the drawing yet, e.g. a note that
  // hasn't been typed in.
  #draftId: string | null = null;
  #gesture: Gesture<T, V> | null = null;
  #longPress: ReturnType<typeof setTimeout> | undefined;
  // Set once a long press opens a menu, so the browser's own long-press
  // `contextmenu` doesn't open it again.
  #openedByLongPress = false;
  // The last press without a drag, to tell a double press.
  #lastPress: { id: string; time: number } | null = null;
  // Items shown as someone else has them, e.g. as they move them, by id.
  // Ones that aren't in the drawing yet are shown above the rest.
  #previews = new Map<string, T>();

  constructor(layerClassName: string, options: ItemLayerOptions<T, V>) {
    this.#options = options;
    const layer = createElement("div", layerClassName);
    layer.addEventListener("pointerdown", this.#onPointerDown);
    layer.addEventListener("pointermove", this.#onPointerMove);
    layer.addEventListener("pointerup", this.#onPointerUp);
    layer.addEventListener("pointercancel", this.#onPointerUp);
    // Cancelling `pointerdown` doesn't stop every browser moving focus, so
    // text being typed would stop as its item is dragged.
    layer.addEventListener("mousedown", (event) => {
      if (this.#gesture) {
        event.preventDefault();
      }
    });
    layer.addEventListener("contextmenu", this.#onContextMenu);
    layer.addEventListener("keydown", this.#onKeyDown);
    this.element = layer;
  }

  get items(): T[] {
    return this.#items;
  }

  setItems(items: T[]): void {
    if (items === this.#items) {
      return;
    }
    this.#items = items;
    this.#render();
  }

  getView(id: string): V | undefined {
    return this.#views.get(id);
  }

  /** Every item shown, including the draft. */
  get views(): V[] {
    return [...this.#views.values()];
  }

  /** How big the item is on screen, in drawing units. */
  getSize(id: string): Size {
    const box = this.#views.get(id)?.element.getBoundingClientRect();
    const zoom = this.#options.getZoom();
    return {
      width: (box?.width ?? 0) / zoom,
      height: (box?.height ?? 0) / zoom,
    };
  }

  /** Puts back an item being dragged, e.g. once a second finger pinches. */
  cancelGesture(): void {
    clearTimeout(this.#longPress);
    const gesture = this.#gesture;
    if (gesture) {
      this.#gesture = null;
      gesture.view.item = gesture.from;
      this.#options.render(gesture.view);
      this.#options.onGestureEnd?.();
    }
  }

  /** Shows an item that isn't in the drawing yet, above the others. */
  addDraft(item: T): V {
    this.#draftId = item.id;
    const view = this.#createView(item);
    this.element.append(view.element);
    this.#options.render(view);
    return view;
  }

  /** Changes the draft, e.g. as it's sized by dragging. */
  updateDraft(item: T): void {
    const view = this.#views.get(item.id);
    if (view && this.isDraft(item.id)) {
      view.item = item;
      this.#options.render(view);
    }
  }

  /**
   * Shows `item` in place of the item with its id, or above the rest if
   * there isn't one yet, until it's shown as null, e.g. as someone drawing
   * together with this canvas moves it, or types in a note they're adding.
   * Returns its view while it's shown.
   */
  setPreview(id: string, item: T | null): V | undefined {
    if (item) {
      this.#previews.set(id, item);
    } else if (!this.#previews.delete(id)) {
      return undefined;
    }
    this.#render();
    return item ? this.#views.get(id) : undefined;
  }

  /** Whether the item is only a preview, since it isn't in the drawing yet. */
  isPreviewOnly(id: string): boolean {
    return (
      this.#previews.has(id) && !this.#items.some((item) => item.id === id)
    );
  }

  isDraft(id: string): boolean {
    return id === this.#draftId;
  }

  /**
   * Stops treating the draft as a draft, once it's added to the drawing, or
   * removes it if it isn't kept.
   */
  endDraft(kept: boolean): void {
    const id = this.#draftId;
    this.#draftId = null;
    if (id !== null && !kept) {
      this.#discard(id);
    }
  }

  /**
   * Shows an item `dx` and `dy` from where it is in the drawing, e.g. as
   * it's moved along with another, until it's shown there again.
   */
  showMoved(id: string, dx: number, dy: number): void {
    const view = this.#views.get(id);
    const item =
      this.#previews.get(id) ?? this.#items.find((each) => each.id === id);
    if (view && item) {
      view.item = { ...item, x: item.x + dx, y: item.y + dy };
      this.#options.render(view);
    }
  }

  /** Removes an item, or discards it if it's the draft. */
  remove(id: string): void {
    if (!this.#views.has(id)) {
      return;
    }
    if (this.isDraft(id)) {
      this.endDraft(false);
      return;
    }
    this.#options.onRemove(id);
  }

  #createView(item: T): V {
    const { className, handles } = this.#options;
    const element = createElement("div", className);
    element.dataset.itemId = item.id;
    // Focusable, so it can be opened or removed from the keyboard.
    element.tabIndex = 0;
    const view = this.#options.createView(item, element);
    for (const handle of handles) {
      const resize = createElement("div", `${className}-resize`);
      resize.dataset.handle = handle;
      element.append(resize);
    }
    this.#views.set(item.id, view);
    return view;
  }

  #discard(id: string): void {
    const view = this.#views.get(id);
    if (view) {
      view.element.remove();
      this.#options.destroyView?.(view);
    }
    this.#views.delete(id);
  }

  // Shows the items, in order, and then previews of ones that aren't in the
  // drawing yet, reusing the elements already shown so one being typed in
  // keeps its focus.
  #render(): void {
    const ids = new Set(this.#items.map(({ id }) => id));
    for (const id of this.#views.keys()) {
      if (!ids.has(id) && !this.isDraft(id) && !this.#previews.has(id)) {
        this.#discard(id);
      }
    }
    const layer = this.element;
    const gesture = this.#gesture;
    const shown = [
      ...this.#items,
      ...[...this.#previews.values()].filter(({ id }) => !ids.has(id)),
    ];
    shown.forEach((item, index) => {
      const view = this.#views.get(item.id) ?? this.#createView(item);
      // One being moved or resized stays where the pointer has it, e.g. as
      // someone drawing together with this canvas changes something else.
      if (gesture?.view !== view || !gesture.moved) {
        view.item = this.#previews.get(item.id) ?? item;
      }
      // Moving the element would take its focus, so it only moves if it has
      // to.
      if (layer.children[index] !== view.element) {
        layer.insertBefore(view.element, layer.children[index] ?? null);
      }
      this.#options.render(view);
    });
  }

  #onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Element;
    const { className, isPressForBrowser } = this.#options;
    const element = target.closest<HTMLDivElement>(`.${className}`);
    const view = element && this.#views.get(element.dataset.itemId!);
    if (
      !view ||
      !event.isPrimary ||
      event.button !== 0 ||
      this.#gesture ||
      isPressForBrowser?.(view, target)
    ) {
      return;
    }
    // Pressing the item would otherwise select text or move focus.
    event.preventDefault();
    view.element.setPointerCapture(event.pointerId);
    const handle = target.closest<HTMLElement>(`.${className}-resize`);
    this.#gesture = {
      view,
      handle: (handle?.dataset.handle as ResizeHandle | undefined) ?? null,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      from: view.item,
      size: this.getSize(view.item.id),
      min: this.#options.getMinSize(view),
      moved: false,
    };
    // Touch has no right-click, so resting on the item opens its menu.
    if (event.pointerType === "touch") {
      const point = { x: event.clientX, y: event.clientY };
      this.#longPress = setTimeout(() => {
        this.#gesture = null;
        this.#openedByLongPress = true;
        this.#options.onMenu(view, point);
      }, LONG_PRESS);
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    const gesture = this.#gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    const screenDx = event.clientX - gesture.start.x;
    const screenDy = event.clientY - gesture.start.y;
    if (!gesture.moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD) {
      return;
    }
    const zoom = this.#options.getZoom();
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    gesture.moved = true;
    clearTimeout(this.#longPress);
    const { from, handle, view } = gesture;
    const { resize, snap } = this.#options;
    if (handle === null) {
      const moved = { ...from, x: from.x + dx, y: from.y + dy };
      view.item = snap ? snap(view, moved, event.altKey) : moved;
    } else {
      view.item = resize(from, gesture.size, handle, dx, dy, gesture.min);
    }
    this.#options.render(view);
    this.#options.onGestureMove?.(view, from, handle !== null);
  };

  #onPointerUp = (event: PointerEvent): void => {
    clearTimeout(this.#longPress);
    const gesture = this.#gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    this.#gesture = null;
    const { view } = gesture;
    if (!gesture.moved) {
      this.#options.onGestureEnd?.();
      if (event.type === "pointerup") {
        this.#press(view, event.timeStamp, event.shiftKey);
      }
      return;
    }
    // The draft isn't in the drawing yet, so it only moves on screen.
    if (!this.isDraft(view.item.id)) {
      this.#options.onChange(view.item);
    }
    this.#options.onGestureEnd?.();
  };

  #onContextMenu = (event: MouseEvent): void => {
    const target = event.target as Element;
    const element = target.closest<HTMLDivElement>(
      `.${this.#options.className}`
    );
    const view = element && this.#views.get(element.dataset.itemId!);
    if (!view) {
      return;
    }
    // Even in text being typed, it's the item's menu rather than the
    // browser's, which would look out of place on the canvas.
    event.preventDefault();
    if (this.#openedByLongPress) {
      this.#openedByLongPress = false;
      return;
    }
    // From the keyboard, e.g. Shift+F10, there's no pointer, so it opens at
    // the item's corner.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const box = view.element.getBoundingClientRect();
    this.#options.onMenu(
      view,
      fromKeyboard
        ? { x: box.left, y: box.bottom }
        : { x: event.clientX, y: event.clientY }
    );
  };

  // Only for the item itself, not what's typed in it.
  #onKeyDown = (event: KeyboardEvent): void => {
    const element = event.target as HTMLElement;
    const view = this.#views.get(element.dataset.itemId ?? "");
    if (!view || view.element !== element) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (this.#options.onDelete && !this.isDraft(view.item.id)) {
        this.#options.onDelete(view);
      } else {
        this.remove(view.item.id);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const { onOpen, onPress } = this.#options;
      if (onOpen) {
        onOpen(view);
      } else {
        onPress?.(view, false);
      }
    }
  };

  // A second press soon after the first, on the same item, opens it.
  #press(view: V, time: number, extend: boolean): void {
    const last = this.#lastPress;
    const { onOpen, onPress } = this.#options;
    if (
      onOpen &&
      last?.id === view.item.id &&
      time - last.time < DOUBLE_PRESS
    ) {
      this.#lastPress = null;
      onOpen(view);
      return;
    }
    this.#lastPress = { id: view.item.id, time };
    onPress?.(view, extend);
  }
}
