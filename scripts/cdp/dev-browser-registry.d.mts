export interface DebugBrowserProcess {
  pid: number
  port: number
  userDataDir: string
  extensionDirs: string[]
}

export interface DevProfileEntry {
  name: string
  dir: string
  worktrees: string[]
  missingWorktrees: string[]
  sizeBytes: number
  inUse: boolean
  shared: boolean
  generated: boolean
  orphan: boolean
}

export interface CachePruneResult {
  removed: { name: string; mtimeMs: number }[]
  freedBytes: number
}

export interface ProfileCleanupPlan {
  closedProfiles: DevProfileEntry[]
  orphans: DevProfileEntry[]
  deleteProfiles: DevProfileEntry[]
  pruneCacheTargets: DevProfileEntry[]
}

export function describeBytes(bytes: number): string
export function parseDebugBrowserProcessCommandLine(
  commandLine: string,
  deps?: { exists?: (target: string) => boolean },
): Omit<DebugBrowserProcess, "pid"> | null
export function listDebugBrowserProcesses(deps?: {
  readProcesses?: () => Promise<{ pid: number; commandLine: string }[]>
  exists?: (target: string) => boolean
}): Promise<DebugBrowserProcess[]>
export function collectProfileWorktrees(profileDir: string): string[]
export function classifyDevProfiles(options?: {
  profilesBaseDir: string
  runningUserDataDirs?: string[]
  exists?: (target: string) => boolean
}): DevProfileEntry[]
export function formatDebugBrowserReport(options: {
  processes: DebugBrowserProcess[]
  profiles: DevProfileEntry[]
}): string
export function planProfileCleanup(
  profiles: DevProfileEntry[],
  options?: { pruneProfiles?: boolean },
): ProfileCleanupPlan
export function pruneProfileCaches(
  profileDir: string,
  options?: { now?: () => number; olderThanMs?: number },
): CachePruneResult
export function removeProfileDir(target: string): boolean
export function devProfilesBaseDir(): string
