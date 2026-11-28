import type { Locator, Page } from "@playwright/test"

interface NativeCheckInStats {
  checked_in_today: boolean
  records: unknown[]
}

export function readNewApiNativeCheckin(
  page: Page,
  expectedUserId: string | number,
): Promise<NativeCheckInStats>

export function runNewApiNativeCheckin(options: {
  optionsPage: Page
  accountRow: Locator
  nativePage: Page
  expectedUserId: string | number
  timeoutMs?: number
}): Promise<
  | { skipped: true; reason: string; before: NativeCheckInStats }
  | {
      before: NativeCheckInStats
      after: NativeCheckInStats
      submissions: Array<{
        hasProof: boolean
        status?: number
        success?: boolean
      }>
      identityReads: Array<{ status: number; userId: string | null }>
    }
>
