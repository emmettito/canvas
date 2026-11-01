// What the timer plays as it goes off.
export type TimerSound = "chime" | "bell" | "marimba" | "alarm" | "none";

// The timer, while it's going.
export interface Timer {
  // When it goes off, by this page's clock, in milliseconds.
  endsAt: number;
  // How long it was set for, in milliseconds.
  duration: number;
  sound: TimerSound;
  // Who started it, by their id while drawing together, or null for whoever's
  // here.
  by: string | null;
}
