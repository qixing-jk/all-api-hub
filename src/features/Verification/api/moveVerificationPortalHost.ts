/** Move persistent editors without losing focus or the user's text selection. */
export function moveVerificationPortalHost(
  host: HTMLElement,
  target: HTMLElement,
) {
  if (host.parentElement === target) return
  const root = host.getRootNode() as Document | ShadowRoot
  const focused = root.activeElement
  const editor =
    focused instanceof HTMLElement && host.contains(focused) ? focused : null
  const selection =
    editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement
      ? {
          start: editor.selectionStart,
          end: editor.selectionEnd,
          direction: editor.selectionDirection,
        }
      : null
  if (
    typeof target.moveBefore === "function" &&
    host.isConnected &&
    target.isConnected
  ) {
    target.moveBefore(host, null)
  } else {
    target.appendChild(host)
  }
  if (editor?.isConnected) {
    editor.focus({ preventScroll: true })
    // Chrome 144 preserves focus with moveBefore but resets textarea selection.
    // Restore the captured range on both native and appendChild paths.
    if (
      selection?.start != null &&
      selection.end != null &&
      (editor instanceof HTMLInputElement ||
        editor instanceof HTMLTextAreaElement)
    ) {
      editor.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction ?? undefined,
      )
    }
  }
}
