import type { SITE_TYPES } from "../../../src/services/accountSiteDefinitions/identifiers"

export interface ShellLiveConfig {
  id: typeof SITE_TYPES.APIYI | typeof SITE_TYPES.LAOZHANG
  origin: string
  username: string
  password: string
  accessToken: string
  expectedUserId: string
}
export function readShellLiveConfig(
  selection: string,
  env?: Record<string, string | undefined>,
): ShellLiveConfig[]
