import type { APIRequestContext } from "@playwright/test"

export type MagpieTestConfig = { baseUrl: string; webKey: string }
export type MagpieTestProvider = {
  id: string
  name: string
  [key: string]: unknown
}
export type MagpieNativeClient = {
  inventory(): Promise<MagpieTestProvider[]>
  save(payload: Record<string, unknown>): Promise<unknown>
  remove(id: string): Promise<unknown>
  key(id: string): Promise<string>
  keyAction(action: string, payload: Record<string, unknown>): Promise<unknown>
}
export function createMagpieNativeClient(
  request: APIRequestContext,
  config: MagpieTestConfig,
): Promise<MagpieNativeClient>
export function createMagpieRunResources(
  native: Pick<MagpieNativeClient, "inventory" | "remove">,
): Promise<{
  ids: Set<string>
  names: Set<string>
  cleanup(): Promise<void>
}>
