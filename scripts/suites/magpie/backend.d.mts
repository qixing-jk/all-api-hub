import type { MagpieTestConfig } from "./native.mjs"

export declare const MAGPIE_WINDOWS_SHA256: string
export function makeMagpieProcessEnv(
  parent: NodeJS.ProcessEnv,
  root: string,
  webKey: string,
): NodeJS.ProcessEnv
export function startMagpieBackend(
  binary: string,
  expectedHash: string,
): Promise<{ config: MagpieTestConfig; root: string; stop(): Promise<void> }>
