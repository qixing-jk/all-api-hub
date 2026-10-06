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

export type ActiveMutationSession = "submit" | "delete"

export type ManagedResourceSessionPhase =
  | "idle"
  | "detail-loading"
  | "detail-open"
  | "editor-loading"
  | "editor-open"
  | "delete-confirmation"
  | "submit"
  | "delete-execution"

export type ManagedResourceEditorFeedback =
  | { kind: "open-failed"; failure: ResourceFailure }
  | { kind: "save-failed"; failure: ResourceFailure }
  | { kind: "save-uncertain"; failure: ResourceFailure }
  | { kind: "saved-refresh-failed" }

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
