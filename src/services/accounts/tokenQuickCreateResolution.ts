import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import type { TokenProvisioningBlockReason } from "~/services/apiAdapters/contracts/tokenProvisioning"

/**
 * Resolution kinds shared by default-token quick-create policy and legacy Sub2API wrappers.
 */
export const TOKEN_QUICK_CREATE_RESOLUTION_KINDS = {
  Ready: "ready",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const

export type Sub2ApiQuickCreateResolution =
  | { kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready; group: string }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      allowedGroups: string[]
    }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked
      message: string
    }

export type DefaultTokenQuickCreateResolution =
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready
      tokenData: CreateTokenRequest
    }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      allowedGroups: string[]
    }
  | {
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked
      reason: TokenProvisioningBlockReason
      message: string
    }
