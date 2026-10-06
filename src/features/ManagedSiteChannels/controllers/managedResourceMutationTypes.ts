import { type RefObject } from "react"

import { type ManagedChannelsDeleteResultStatus } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  type ManagedResourceRef,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import { type ManagedResourceEditorMode } from "../presentation/managedResourceFieldPolicy"
import { type ManagedResourceRowData } from "../presentation/managedResourcePresentation"
import { type ManagedResourceControllerAnalytics } from "./managedResourceControllerAnalytics"

export type DeleteResult = {
  rowKey: string
  status: ManagedChannelsDeleteResultStatus
  resultKey: string
}

export type DeleteExecutionResult = {
  status: DeleteResult["status"]
  locallyConfirmed: boolean
}

export type DeleteState = {
  isOpen: boolean
  isExecuting: boolean
  rowKeys: string[]
  results: DeleteResult[]
  requiresRefresh: boolean
  requiresFreshRead: boolean
  failure: ResourceFailure | null
}

export const ACTIVE_MUTATION_SESSIONS = {
  Submit: "submit",
  Delete: "delete",
} as const

export type ActiveMutationSession =
  (typeof ACTIVE_MUTATION_SESSIONS)[keyof typeof ACTIVE_MUTATION_SESSIONS]

export const MANAGED_RESOURCE_SESSION_PHASES = {
  Idle: "idle",
  DetailLoading: "detail-loading",
  DetailOpen: "detail-open",
  EditorLoading: "editor-loading",
  EditorOpen: "editor-open",
  DeleteConfirmation: "delete-confirmation",
  Submit: "submit",
  DeleteExecution: "delete-execution",
} as const

export type ManagedResourceSessionPhase =
  (typeof MANAGED_RESOURCE_SESSION_PHASES)[keyof typeof MANAGED_RESOURCE_SESSION_PHASES]

export const MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS = {
  OpenFailed: "open-failed",
  SaveFailed: "save-failed",
  SaveUncertain: "save-uncertain",
  SavedRefreshFailed: "saved-refresh-failed",
} as const

export type ManagedResourceEditorFeedback =
  | {
      kind: typeof MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.OpenFailed
      failure: ResourceFailure
    }
  | {
      kind: typeof MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveFailed
      failure: ResourceFailure
    }
  | {
      kind: typeof MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveUncertain
      failure: ResourceFailure
    }
  | {
      kind: typeof MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SavedRefreshFailed
    }

export type ManagedResourceMutationOptions = {
  readEditor?: <T>(read: () => Promise<T>, signal?: AbortSignal) => Promise<T>
  workspace: ManagedResourceWorkspace | null
  refresh?: () => Promise<boolean>
  resolveRef?: (rowKey: string) => ManagedResourceRef | undefined
  mapFacts?: (facts: ResourceDisplayFacts) => ManagedResourceRowData
  acceptMutationResult?: (
    mode: ManagedResourceEditorMode,
    facts: ResourceDisplayFacts,
  ) => boolean
  acceptDeletionResults?: (
    targets: readonly { rowKey: string; ref: ManagedResourceRef }[],
  ) => boolean
  onMutationStart?: () => void
  onMutationSuccess?: (mode: ManagedResourceEditorMode) => void
  onMutationConfirmed?: (mode: ManagedResourceEditorMode) => void
  analytics?: ManagedResourceControllerAnalytics
}

export interface ManagedResourceMutationGate {
  phase: RefObject<ManagedResourceSessionPhase>
  active: RefObject<ActiveMutationSession | null>
  begin: (session: ActiveMutationSession) => boolean
  end: (session: ActiveMutationSession) => void
}
