export declare const CRX_ENV_VARS: {
  readonly PrivateKeyPem: "AAH_CRX_PRIVATE_KEY_PEM"
  readonly PrivateKeyBase64: "AAH_CRX_PRIVATE_KEY_BASE64"
  readonly PrivateKeyPath: "AAH_CRX_PRIVATE_KEY_PATH"
  readonly RequireCrxSelfUpdate: "AAH_REQUIRE_CRX_SELF_UPDATE"
  readonly SelfUpdateUrl: "AAH_SELF_UPDATE_URL"
  readonly BuildTime: "AAH_CRX_BUILD_TIME"
}

export declare const SELF_UPDATE_CHANNELS: ReadonlySet<string>

export interface CrxUpdateManifestOptions {
  extensionId: string
  version: string
  codebase: string
}

export interface CrxPackOptions {
  zipBuffer: Buffer
  privateKeyPem: string
}

export function deriveCrxExtensionId(privateKeyPem: string): string

export function buildCrxUpdateManifest(
  options: CrxUpdateManifestOptions,
): string

export function getCrxSelfUpdateUrl(channel: string): string

export function getCrxUpdateManifestAssetName(channel: string): string

export function getCrxAssetName(channel: string): string

export function getCrxCodebaseUrl(channel: string): string

export function hasCrxPrivateKey(
  env?: Record<string, string | undefined>,
): boolean

export function packCrx3(options: CrxPackOptions): Buffer

export function readCrxPrivateKey(
  env?: Record<string, string | undefined>,
): Promise<string>
