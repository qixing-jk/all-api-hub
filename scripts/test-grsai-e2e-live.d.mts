export function main(args?: string[]): Promise<void>
export function parseArgs(args: string[]): {
  siteUrl: string
  token: string
  suite: string
  cdpUrl: string
}