import { type TimerSound } from "../models/timer.model";

export const TIMER_LAYOUT = {
  // The lengths offered, in minutes.
  presets: [1, 3, 5, 10, 15, 30],
  // What a timer is set for until another's started, in milliseconds.
  defaultDuration: 5 * 60_000,
  defaultSound: "chime" as TimerSound,
  // The longest it can be set for, in minutes: a day, as the server allows.
  maxMinutes: 24 * 60,
  // How much more time adding some gives, in milliseconds.
  addTime: 60_000,
  // How often it checks whether it's gone off, in milliseconds.
  tick: 250,
};
