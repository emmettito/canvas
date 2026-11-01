import { type TimerSound } from "../models/timer.model";

// Made once something's played, and kept, since browsers limit how many a
// page can have.
let context: AudioContext | null = null;

interface Tone {
  frequency: number;
  // Seconds after the sound starts.
  at: number;
  // Seconds it takes to fade out.
  length: number;
  type?: OscillatorType;
  volume?: number;
}

// Each sound as the tones it's made of, so there are no files to load.
const SOUNDS: Record<Exclude<TimerSound, "none">, Tone[]> = {
  // Rising, twice.
  chime: [0, 1].flatMap((round) =>
    [1047, 1319, 1568].map((frequency, index) => ({
      frequency,
      at: round * 1 + index * 0.18,
      length: 1.2,
    }))
  ),
  // A struck bell's partials, which aren't in tune with each other, twice.
  bell: [0, 1.4].flatMap((at) => [
    { frequency: 660, at, length: 2.4, volume: 0.3 },
    { frequency: 660 * 2.76, at, length: 1.2, volume: 0.12 },
    { frequency: 660 * 5.4, at, length: 0.6, volume: 0.06 },
  ]),
  // Up and back down, short and wooden.
  marimba: [523, 659, 784, 1047, 784, 659, 523].map((frequency, index) => ({
    frequency,
    at: index * 0.14,
    length: 0.45,
    type: "triangle",
    volume: 0.4,
  })),
  // Four quick beeps, three times.
  alarm: [0, 0.9, 1.8].flatMap((round) =>
    [0, 1, 2, 3].map((beep) => ({
      frequency: 880,
      at: round + beep * 0.15,
      length: 0.1,
      type: "square",
      volume: 0.08,
    }))
  ),
};

/**
 * Plays `sound`, e.g. as the timer goes off. Browsers only play sound on a
 * page that's been clicked or typed in, so on one that hasn't, nothing plays.
 */
export function playTimerSound(sound: TimerSound): void {
  if (sound === "none" || typeof AudioContext === "undefined") {
    return;
  }
  context ??= new AudioContext();
  void context.resume();
  const start = context.currentTime + 0.05;
  for (const { frequency, at, length, type = "sine", volume = 0.25 } of SOUNDS[
    sound
  ]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    // Struck, then fading: a quick rise avoids a click.
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(volume, start + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + length + 0.05);
  }
}

/** Whether `value` is a sound the timer plays, e.g. one from someone else. */
export function isTimerSound(value: unknown): value is TimerSound {
  return value === "none" || (typeof value === "string" && value in SOUNDS);
}
