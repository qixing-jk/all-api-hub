export function main(args?: string[]): Promise<void>
export function parseArgs(args: string[]): {
  token: string
  refreshToken: string
  organizationId: string
  suite: string
  cdpUrl: string
  siteUrl: string
  siteType: string
}
