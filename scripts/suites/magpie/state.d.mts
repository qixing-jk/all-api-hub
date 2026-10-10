import type { MagpieTestConfig } from "./native.mjs"

type Snapshot = {
  patches: Array<{ path: string[]; value: unknown; before?: unknown }>
  credentialIds: string[]
  history: unknown
}
export function patchMagpieBrowserState(
  config: MagpieTestConfig,
): Promise<Snapshot>
export function restoreMagpieBrowserState(options: {
  snapshot: Snapshot
  config: MagpieTestConfig
  invalidKey: string
  credentialNames: string[]
  credentialIds: string[]
  resourceIds: string[]
}): Promise<void>
