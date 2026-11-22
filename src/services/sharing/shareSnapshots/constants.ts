/** Public payload and export values; importing these does not load financial projections. */
export const SHARE_SNAPSHOT_KINDS = {
  Overview: "overview",
  Account: "account",
} as const

export const SHARE_SNAPSHOT_EXPORT_METHODS = {
  Clipboard: "clipboard",
  Download: "download",
} as const
