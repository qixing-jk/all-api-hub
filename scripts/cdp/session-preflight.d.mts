import type { Page } from "@playwright/test"

export type SessionProbe =
  | { status: "authenticated"; identity: string }
  | { status: "unauthenticated" }
  | { status: "error"; reason: string }

export interface SessionSource {
  name: string
  probe(): Promise<SessionProbe>
  /** Assess all applicable transfer methods; absent means not yet checked. */
  checkTransfer?(): Promise<"available" | "unavailable" | "unchecked">
}

export interface SessionPreflight {
  status:
    | "ready"
    | "sync-available"
    | "source-check-required"
    | "manual-login-required"
    | "probe-failed"
    | "identity-mismatch"
  target: SessionProbe
  sources: Array<{
    name: string
    session: SessionProbe
    transfer?: "available" | "unavailable" | "unchecked"
  }>
  sourceDiscoveryComplete: boolean
}

export function preflightSession(options: {
  probeTarget(): Promise<SessionProbe>
  expectedIdentity?: string
  sources?: SessionSource[]
  /** True only after all task-authorized session sources have been assessed. */
  sourceDiscoveryComplete?: boolean
}): Promise<SessionPreflight>

export function probePageSession(
  page: Pick<Page, "evaluate">,
  options: {
    endpoint: string
    /** Return only a stable, non-secret account ID for an authenticated user. */
    readIdentity(body: unknown): string | undefined
  },
): Promise<SessionProbe>
