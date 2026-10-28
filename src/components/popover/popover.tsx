import { JSX, ReactNode } from "react";
import "./popover.css";

interface PopoverProps {
  children: ReactNode;
}

/** Floats above its nearest positioned ancestor, pointing down at it. */
export function Popover({ children }: PopoverProps): JSX.Element {
  return <div className="popover">{children}</div>;
}
