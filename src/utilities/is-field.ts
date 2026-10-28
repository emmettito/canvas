/** Whether `target` takes typing, e.g. a text box, so keys are left to it. */
export function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}
