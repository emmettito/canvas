import { type TimerSound } from "../models/timer.model";

// What the timer can play, in the order it offers them, with their names.
export const TIMER_SOUNDS: { value: TimerSound; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "marimba", label: "Marimba" },
  { value: "alarm", label: "Alarm" },
  { value: "none", label: "None" },
];
