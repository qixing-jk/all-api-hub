export function runKimiProbe(options: {
  token: string
  refreshToken?: string
  baseUrl?: string
}): Promise<{
  ok: boolean
  userInfoOk: boolean
  balanceOk: boolean
  projectsOk: boolean
  keyCrudOk: boolean
  tokenRefreshOk: boolean
  skipped?: boolean
}>
