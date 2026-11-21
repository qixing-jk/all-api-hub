import type { UsageScope } from "~/services/amounts/balance"
import {
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Unknown restrictions remain explicit until the adapter verifies them. */
export function accountBalanceScope<
  T extends Pick<ApiServiceRequest, "baseUrl" | "accountId">,
>(
  request: T,
  identity: {
    walletId?: string
    organizationId?: string
    workspaceId?: string
    authority?: string
  } = {},
): UsageScope {
  return {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      ...(request.accountId ? { accountId: request.accountId } : {}),
    },
    authority: new URL(request.baseUrl).origin,
    ...identity,
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  }
}
