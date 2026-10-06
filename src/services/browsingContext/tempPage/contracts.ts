import {
  TEMP_CONTEXT_MODES,
  type TempContextMode,
} from "~/constants/tempContextMode"
import {
  type AuthorizedTempContextOutcome,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { type ProtectionBypassPolicyDecision } from "~/services/protectionBypass/policy"

export type TaskParams<TKind extends TempContextTask["kind"]> = Extract<
  TempContextTask,
  { kind: TKind }
>["params"]

export const TEMP_CONTEXT_TYPES = {
  Window: TEMP_CONTEXT_MODES.Window,
  Tab: TEMP_CONTEXT_MODES.Tab,
} as const

export interface TempContextTabSnapshot {
  url?: string
  status?: string
}

export type ReportAuthorizedTempContextOutcome = (
  outcome: AuthorizedTempContextOutcome,
) => void

export type AuthorizeTempContextAtAcquire =
  (() => Promise<ProtectionBypassPolicyDecision>) & {
    reportOutcome?: ReportAuthorizedTempContextOutcome
  }

type TempContextSharedFields = {
  id: number
  tabId: number
  origin: string
  currentUrl?: string
  activeRequestIds: Set<string>
  lastUsed: number
  downloadBlockRuleId?: number | null
  firefoxDownloadBlockTabId?: number | null
  releaseTimer?: ReturnType<typeof setTimeout>
}

export type TempContextOpenMode = TempContextMode

type TempContextOwnership =
  | {
      type: typeof TEMP_CONTEXT_TYPES.Window
      mode: typeof TEMP_CONTEXT_MODES.Window
      ownerWindowId: number
    }
  | {
      type: typeof TEMP_CONTEXT_TYPES.Tab
      mode: typeof TEMP_CONTEXT_MODES.Composite
      ownerWindowId: number
    }
  | {
      type: typeof TEMP_CONTEXT_TYPES.Tab
      mode: typeof TEMP_CONTEXT_MODES.Tab
      ownerWindowId?: never
    }

export type TempContext = TempContextSharedFields & TempContextOwnership

export type TempWindowHandle =
  | { kind: typeof TEMP_CONTEXT_MODES.Window; windowId: number; tabId: number }
  | { kind: typeof TEMP_CONTEXT_MODES.Tab; tabId: number }
  | {
      kind: typeof TEMP_CONTEXT_MODES.Composite
      tabId: number
      windowId: number
    }

export type TempContextOpenResult =
  | {
      id: number
      tabId: number
      type: typeof TEMP_CONTEXT_TYPES.Window
      mode: typeof TEMP_CONTEXT_MODES.Window
      ownerWindowId: number
    }
  | {
      id: number
      tabId: number
      type: typeof TEMP_CONTEXT_TYPES.Tab
      mode: typeof TEMP_CONTEXT_MODES.Composite
      ownerWindowId: number
    }
  | {
      id: number
      tabId: number
      type: typeof TEMP_CONTEXT_TYPES.Tab
      mode: typeof TEMP_CONTEXT_MODES.Tab
      ownerWindowId?: never
    }

/**
 * 释放与 requestId 关联的临时上下文：
 * - 支持强制关闭（forceClose）直接销毁窗口/标签页
 * - 否则从持有集合中移除 request，仅在最后一个持有者释放后才进入空闲清理/销毁流程。
 */
export type TempContextReleaseOptions = {
  forceClose?: boolean
  reason?: string
}
