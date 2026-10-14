import type { Adb } from "./discovery.mjs"

export function isDevOutputReady(
  sourceDir: string,
  port: number,
): Promise<boolean>
export function withReversePort(
  device: string,
  port: number,
  adb?: Adb,
): Promise<() => Promise<void>>
export function runMobileDev(options: {
  device: string
  browser: string
  packageName?: string
  port?: number
  duration?: number
  emit: (result: Record<string, unknown>) => void
}): Promise<void>
