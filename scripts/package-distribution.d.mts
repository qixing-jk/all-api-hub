export interface DistributionBuildTarget {
  browser: string
  channel: string
  store: boolean
  outputDirectory: string
}

export function createDistributionBuildPlan(
  channel: string,
  stores: boolean,
): DistributionBuildTarget[]
