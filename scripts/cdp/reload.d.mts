/** Reload only the enabled extension installed from this absolute output path. */
export function reloadRunningExtension(
  cdpPort: number,
  extensionDir: string,
): Promise<string>
