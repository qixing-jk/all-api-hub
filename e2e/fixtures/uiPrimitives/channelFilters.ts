/** A pending write lets the browser exercise disabled controls and failure recovery. */
export async function fetchChannelFilterSettings() {
  return { filters: [], modelSyncExcluded: false }
}

/** The test releases the pending server failure without interacting outside the dialog. */
export async function saveChannelFilters() {
  await new Promise<void>((_resolve, reject) => {
    window.addEventListener(
      "fixture-save-failed",
      () => reject(new Error("Fixture write failed")),
      { once: true },
    )
  })
}
