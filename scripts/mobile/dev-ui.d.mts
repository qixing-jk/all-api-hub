export function runDevUi(
  client: {
    request(
      method: string,
      params?: Record<string, unknown>,
    ): Promise<{ result?: { result?: { value?: unknown } } }>
  },
  emit: (event: Record<string, unknown>) => void,
  duration: number,
): Promise<void>
