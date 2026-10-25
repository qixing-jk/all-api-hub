export function readAllPmApiTokens<T>(
  read: (path: string) => Promise<{ items: T[]; total: number }>,
): Promise<T[]>
