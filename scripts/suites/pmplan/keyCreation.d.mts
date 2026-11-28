import type { Page } from "@playwright/test"

interface PmplanKeyCreationOptions {
  page: Page
  input: { expires_at: string | null; models: string[] }
  write: boolean
  confirmedIds: Set<number>
  existingIds: ReadonlySet<number>
  evidenceDir: string
  timeoutMs?: number
}

export function submitPmplanKeyCreation(
  options: PmplanKeyCreationOptions & {
    expectValidationError: true
  },
): Promise<void>
export function submitPmplanKeyCreation(
  options: PmplanKeyCreationOptions & {
    expectValidationError?: false
  },
): Promise<{ id: number; key: string }>
