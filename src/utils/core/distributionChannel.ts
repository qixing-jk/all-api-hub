/** The release artifact's intended distribution channel, independent of its host browser. */
export const DISTRIBUTION_CHANNEL = {
  ChromeWebStore: "chrome-web-store",
  EdgeAddons: "edge-addons",
  FirefoxAmo: "firefox-amo",
  GithubRelease: "github-release",
  GithubNightly: "github-nightly",
  LocalDevelopment: "local-development",
  Unknown: "unknown",
} as const

export const DISTRIBUTION_CHANNELS = [
  DISTRIBUTION_CHANNEL.ChromeWebStore,
  DISTRIBUTION_CHANNEL.EdgeAddons,
  DISTRIBUTION_CHANNEL.FirefoxAmo,
  DISTRIBUTION_CHANNEL.GithubRelease,
  DISTRIBUTION_CHANNEL.GithubNightly,
  DISTRIBUTION_CHANNEL.LocalDevelopment,
  DISTRIBUTION_CHANNEL.Unknown,
] as const

export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number]

declare const __AAH_DISTRIBUTION_CHANNEL__: unknown

const STORE_BROWSERS: Partial<Record<DistributionChannel, string>> = {
  [DISTRIBUTION_CHANNEL.ChromeWebStore]: "chrome",
  [DISTRIBUTION_CHANNEL.EdgeAddons]: "edge",
  [DISTRIBUTION_CHANNEL.FirefoxAmo]: "firefox",
}

/** Validate channel metadata at build, storage, and analytics boundaries. */
export function isDistributionChannel(
  value: unknown,
): value is DistributionChannel {
  return DISTRIBUTION_CHANNELS.includes(value as DistributionChannel)
}

/** Reads only the baked enum; old or unrecognized builds remain unknown. */
export function getDistributionChannel(): DistributionChannel {
  const value =
    typeof __AAH_DISTRIBUTION_CHANNEL__ === "undefined"
      ? undefined
      : __AAH_DISTRIBUTION_CHANNEL__
  return isDistributionChannel(value) ? value : DISTRIBUTION_CHANNEL.Unknown
}

/** Validates build inputs before any release artifact is produced. */
export function resolveDistributionChannel(
  requested: string | undefined,
  browser: string,
  command: string,
): DistributionChannel {
  if (command === "serve") return DISTRIBUTION_CHANNEL.LocalDevelopment
  if (!requested) return DISTRIBUTION_CHANNEL.Unknown
  if (!isDistributionChannel(requested)) {
    throw new Error(`Invalid distribution channel: ${requested}`)
  }
  const storeBrowser = STORE_BROWSERS[requested]
  if (storeBrowser && storeBrowser !== browser) {
    throw new Error(
      `Distribution channel ${requested} cannot target ${browser}`,
    )
  }
  return requested
}
