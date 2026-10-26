export interface DevBrowserIdentity {
  displayName: string
  accentColor: string
  avatarIndex: number
}

export interface DevBrowserProfilePreparation {
  applied: boolean
  reason?: string
  profileDirectory: string
  renamed: boolean
  namePreserved: boolean
  avatarIndex?: number
  pinnedExtensionIds: string[]
  themeReserved: boolean
}

export interface DevBrowserProfileInput {
  userDataDir: string
  identity: DevBrowserIdentity
  extensionIds?: readonly string[]
}

export interface ProfileLockDeps {
  openFile?: (file: string, flags: string) => number
  closeFile?: (handle: number) => void
  readLink?: (file: string) => string
  kill?: (pid: number) => unknown
  hostname?: () => string
}

export function deriveUnpackedExtensionId(extensionDir: string): string
export function buildDevBrowserIdentity(input: {
  profileDir: string
  worktreeName: string
  isolated: boolean
}): DevBrowserIdentity
export function resolveProfileDirectory(userDataDir: string): string
export function isUserDataDirInUse(
  userDataDir: string,
  deps?: ProfileLockDeps,
): boolean
export function waitForUserDataDirRelease(
  userDataDir: string,
  options?: { timeoutMs?: number; intervalMs?: number },
  deps?: ProfileLockDeps,
): Promise<boolean>
export function skippedDevBrowserPreparation(
  userDataDir: string,
  reason?: string,
): DevBrowserProfilePreparation
export function prepareDevBrowserProfile(
  input: DevBrowserProfileInput,
  deps?: ProfileLockDeps,
): DevBrowserProfilePreparation
