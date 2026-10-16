import type { MobileConnection } from "./discovery.mjs"

type Target = { id: string; url: string; type: string }
type Adapter = {
  targets: Target[]
  evaluate(
    target: Target,
    expression: string,
  ): Promise<{ value: unknown; remote: unknown }>
  logs(
    target: Target,
    emit: (event: unknown) => void,
    duration: number,
  ): Promise<void>
  reload(target: Target): Promise<{ status: string; changesDeployed: boolean }>
  close(): void
}
export function selectTarget<T extends { id: string; url: string }>(
  targets: T[],
  context?: string,
  targetId?: string,
): T
export function chromiumAdapter(
  connection: MobileConnection,
  options?: { extensionId?: string },
): Promise<
  Adapter & {
    devUi(
      target: Target,
      emit: (event: Record<string, unknown>) => void,
      duration: number,
    ): Promise<void>
  }
>
export function firefoxAdapter(
  connection: Pick<MobileConnection, "port">,
  options?: { extensionId?: string },
): Promise<Adapter>
