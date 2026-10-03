export function runGrsaiProbe(options: {
  /** Saved console session token (JWT). Omit for structural checks only. */
  token?: string
  siteUrl?: string
  timeoutMs?: number
}): Promise<{
  ok: boolean
  consoleEnvelopeOk: boolean
  notNewApi: boolean
  sessionOk: boolean
  accountOk: boolean
  keysOk: boolean
  modelsOk: boolean
  skipped: boolean
  plaintextKeyCount?: number
  modelCount?: number
}>
