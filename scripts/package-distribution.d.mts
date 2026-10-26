export interface DistributionBuildTarget {
  browser: string
  channel: string
  store: boolean
  /** Emit a signed CRX plus its update manifest instead of an unpacked ZIP. */
  selfUpdate: boolean
  artifact?: "crx"
  outputDirectory: string
}

export function createDistributionBuildPlan(
  channel: string,
  stores: boolean,
): DistributionBuildTarget[]

export function getSelfUpdateSkipReason(options: {
  hasPrivateKey: boolean
  requireSigning?: boolean
}): string | null

export function assertSelfUpdateSigningAvailable(options: {
  hasPrivateKey: boolean
  requireSigning: boolean
}): string | null
