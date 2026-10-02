export function withTemporaryAccount<T>(worker: { evaluate: (...args: any[]) => Promise<any> }, fixture: Record<string, any>, work: (fixture: Record<string, any>) => Promise<T>): Promise<T>
export function getAccounts(worker: { evaluate: (...args: any[]) => Promise<any> }): Promise<Record<string, any>[]>
export function withStoredValue<T>(worker: { evaluate: (...args: any[]) => Promise<any> }, storageKey: string, patch: Record<string, any>, work: () => Promise<T>): Promise<T>
