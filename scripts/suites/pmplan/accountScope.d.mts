type AccountScope = {
  id: string
  site_type: string
  site_url: string
  account_info: { id: string | number }
}

export function requirePmplanAccount<TAccount extends AccountScope>(
  accounts: readonly TAccount[],
  userId: string | number,
): TAccount

export function readPmplanAnnouncementStatus(
  serviceWorker: Pick<import("@playwright/test").Worker, "evaluate">,
  account: AccountScope,
): Promise<string | undefined>
