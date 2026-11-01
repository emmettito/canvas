/** Where a ruler's ticks go, in drawing units. */
export interface TickSpacing {
  // How far apart the labeled ticks are.
  step: number;
  // How far apart all the ticks are, labeled or not.
  minor: number;
}

/**
 * The tick spacing that keeps labeled ticks at least `minGap` pixels apart at
 * `zoom`: the smallest of 1, 2 or 5 times a power of ten that does, so the
 * labels are round numbers.
 */
export function getTickSpacing(zoom: number, minGap: number): TickSpacing {
  const least = minGap / zoom;
  const power = 10 ** Math.floor(Math.log10(least));
  const multiple = [1, 2, 5, 10].find((each) => each * power >= least) ?? 10;
  // 1s and 5s split into fifths, and 2s into quarters, so the ticks between
  // land on round numbers too.
  return {
    step: multiple * power,
    minor: (multiple * power) / (multiple === 2 ? 4 : 5),
  };
}

/** The multiples of `step` from `start` to `end`, in order. */
export function getTicks(start: number, end: number, step: number): number[] {
  const ticks: number[] = [];
  for (let i = Math.ceil(start / step); i * step <= end; i++) {
    ticks.push(i * step);
  }
  return ticks;
}
