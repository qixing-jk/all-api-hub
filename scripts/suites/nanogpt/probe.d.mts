export interface NanoGptCredentialReadback {
  balance: {
    usd_balance: string | number
    nano_balance?: string | number
    nanoDepositAddress: string
  }
  usage: {
    totals: {
      requests: number
      totalTokens: number
      costUsd?: number
      netCostUsd?: number
    }
  }
  subscription: { active: boolean; [field: string]: unknown }
}
export function readNanoGptCredential(
  apiKey: string,
): Promise<NanoGptCredentialReadback>
export function runNanoGptProbe(options: {
  apiKey: string
  evidenceDir: string
}): Promise<{ ok: true } | { skipped: true; reason: string }>
