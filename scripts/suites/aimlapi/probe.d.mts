export function runAimlapiProbe(options: {
  managementKey?: string
  apiKey?: string
  timeoutMs?: number
}): Promise<{
  ok: boolean
  checked: number
  failed: { name: string; ok: boolean; detail: string }[]
}>
