/**
 * Wires up the demo page's Settings dialog, and returns a function that opens
 * it. Settings apply as soon as they change, so there's nothing to confirm,
 * only closing. Its close button and Escape close it without any script.
 */
export function setUpSettings(dialog: HTMLDialogElement): () => void {
  // The dialog's content fills it, so a click that lands on the dialog
  // itself was on the backdrop around it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  return () => dialog.showModal();
}
