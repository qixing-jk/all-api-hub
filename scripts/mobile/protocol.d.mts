type EventListener = (event: Record<string, unknown>) => void
type NativeClient = {
  onEvent(listener: EventListener): () => void
  close(): void
}
export function connectCdp(url: string): Promise<
  NativeClient & {
    request(
      method: string,
      params?: Record<string, unknown>,
    ): Promise<Record<string, unknown>>
  }
>
export function connectRdp(port: number): Promise<
  NativeClient & {
    request(
      to: string,
      type: string,
      params?: Record<string, unknown>,
    ): Promise<Record<string, unknown>>
  }
>
