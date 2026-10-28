export function withTemporaryAccount<T>(
  worker: { evaluate: (...args: any[]) => Promise<any> },
  fixture: Record<string, any>,
  work: (fixture: Record<string, any>) => Promise<T>,
): Promise<T>
export function getAccounts(worker: {
  evaluate: (...args: any[]) => Promise<any>
}): Promise<Record<string, any>[]>
export function withUiCreatedAccount<T>(
  worker: { evaluate: (...args: any[]) => Promise<any> },
  create: (name: string) => Promise<void>,
  work: (account: Record<string, any>) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T>
export function withStoredValue<T>(
  worker: { evaluate: (...args: any[]) => Promise<any> },
  storageKey: string,
  patch: Record<string, any>,
  work: () => Promise<T>,
  options?: { restorePatchedKeysOnly?: boolean },
): Promise<T>
