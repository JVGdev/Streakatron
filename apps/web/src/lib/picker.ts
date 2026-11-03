// Whether a suggestion list (the mention picker) is open in some editor. Modal sheets and dialogs
// close on Escape before the editor sees the key; while a picker is open, Escape is for the picker.

export const picker = { open: false };

/** For a Radix sheet's or dialog's `onEscapeKeyDown`: keep it open while a picker is. */
export function keepOpenForPicker(event: KeyboardEvent) {
  if (picker.open) event.preventDefault();
}
