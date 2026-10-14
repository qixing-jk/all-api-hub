export type Adb = (args: string[]) => Promise<string>
export type MobileConnection = {
  device: string
  browser: string
  packageName: string
  port: number
  base: string
  socket: string
  version: Record<string, unknown> | null
  close(): Promise<void>
}
export declare const BROWSER_PACKAGES: Record<string, string[]>
export function runAdb(args: string[]): Promise<string>
export function selectDevice(output: string, requested?: string): string
export function discoverMobileConnection(options: {
  device: string
  browser: string
  packageName?: string
  adb?: Adb
  readVersion?: (base: string) => Promise<Record<string, unknown>>
}): Promise<MobileConnection>
