export function runKimiProbe(options: {
  token: string
  /** Accepted for old callers; connectivity probes never rotate this credential. */
  refreshToken?: string
  baseUrl?: string
}): Promise<{
  ok: boolean
  userInfoOk: boolean
  balanceOk: boolean
  projectsOk: boolean
  keyCrudOk: boolean
  skipped?: boolean
}>
