export const WORKTREE_NAME: string
export function isIsolatedDevProfile(): boolean
export function applyIsolateFlag(args: readonly string[]): boolean
export function resolveDevProfileDir(checkoutRoot?: string): string
export function resolveCdpPort(): number
