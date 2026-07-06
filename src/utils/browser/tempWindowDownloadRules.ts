const TEMP_WINDOW_BLOCKED_DOWNLOAD_EXTENSIONS = [
  "apk",
  "appimage",
  "bat",
  "cmd",
  "com",
  "deb",
  "dmg",
  "exe",
  "msi",
  "msp",
  "pkg",
  "ps1",
  "rpm",
  "scr",
  "sh",
  "vbs",
] as const

export const TEMP_WINDOW_DOWNLOAD_BLOCK_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "object",
  "xmlhttprequest",
  "other",
] as const

/**
 * Builds a case-insensitive DNR regex fragment for blocked installer suffixes.
 */
export function buildTempWindowBlockedDownloadExtensionPattern(): string {
  return TEMP_WINDOW_BLOCKED_DOWNLOAD_EXTENSIONS.map((extension) =>
    Array.from(extension)
      .map((char) =>
        /[a-z]/i.test(char)
          ? `[${char.toLowerCase()}${char.toUpperCase()}]`
          : char,
      )
      .join(""),
  ).join("|")
}

/**
 * Returns whether a URL points to an obvious executable or installer payload.
 */
export function isTempWindowBlockedDownloadUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return TEMP_WINDOW_BLOCKED_DOWNLOAD_EXTENSIONS.some((extension) =>
      pathname.endsWith(`.${extension}`),
    )
  } catch {
    return false
  }
}
