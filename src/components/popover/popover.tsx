import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import "./popover.css";

// Minimum distance kept between the popover and the edges of the viewport.
const VIEWPORT_MARGIN = 8;

interface PopoverProps {
  children: ReactNode;
  onClose: () => void;
}

/** Floats above its nearest positioned ancestor, pointing down at it. */
export function Popover({ children, onClose }: PopoverProps): JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null);
  // Where focus was before opening, to return it when closed with Escape.
  const openerRef = useRef<Element | null>(null);

  // Shift back inside the viewport if centering pushes it past an edge. The
  // arrow shifts the opposite way so it still points at the same spot.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) {
      return;
    }
    const { left, right } = popover.getBoundingClientRect();
    const viewportRight =
      document.documentElement.clientWidth - VIEWPORT_MARGIN;
    let shift = 0;
    if (left < VIEWPORT_MARGIN) {
      shift = VIEWPORT_MARGIN - left;
    } else if (right > viewportRight) {
      shift = viewportRight - right;
    }
    popover.style.setProperty("--popover-shift", `${shift}px`);
  }, []);

  // Move focus inside, preferring the selected option, so keyboard users can
  // reach the controls.
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) {
      return;
    }
    // Strict mode runs this twice, and focus is already inside the second time.
    if (!popover.contains(document.activeElement)) {
      // Safari doesn't focus buttons on click, so fall back to the button the
      // popover is anchored to.
      openerRef.current =
        document.activeElement === document.body
          ? (popover.parentElement?.querySelector(":scope > button") ?? null)
          : document.activeElement;
    }
    const target =
      popover.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      popover.querySelector<HTMLElement>("button, input");
    target?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") {
      return;
    }
    onClose();
    if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
    }
  };

  return (
    <div className="popover" ref={popoverRef} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
