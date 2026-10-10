import type {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES,
  ACCOUNT_KEY_STATUS_FILTERS,
  AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { type NativeResourceEditorOpeningState } from "~/features/ResourceEditor/opening/nativeResourceEditorOpeningState"
import type { AccountKeyCreationResult } from "~/services/accounts/keys/accountKeyCreation"
import { type DisplayAccountApiSnapshot } from "~/services/accounts/utils/apiServiceRequest"
import {
  type AccountKeyCreationIntent,
  type AccountKeyResourceCollection,
  type AccountKeyResourceEditor,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
  type EditableResourceProjection,
  type ResourceFailure,
  type ResourceFieldOption,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"

export type StatusFilter =
  (typeof ACCOUNT_KEY_STATUS_FILTERS)[keyof typeof ACCOUNT_KEY_STATUS_FILTERS]

export type ControllerMode =
  (typeof ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES)[keyof typeof ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES]

export type ControllerNotice = { kind: "workspace-fallback" }

export type EditorMode = AccountKeyResourceEditorMode

export type MutationAnalyticsMode =
  | typeof PRODUCT_ANALYTICS_MODE_IDS.Single
  | typeof PRODUCT_ANALYTICS_MODE_IDS.All

export type EditorState = {
  editorId: number
  siteType: AccountKeyResourceRef["siteType"]
  mode: EditorMode
  fields: AccountKeyResourceEditor["fields"]
  initialValues: EditableResourceProjection
  values: EditableResourceProjection
  optionsByField: Record<string, readonly ResourceFieldOption[]>
  optionFailuresByField: Record<string, ResourceFailure | undefined>
  loadingFieldIds: readonly string[]
  feedback: ResourceFailure | null
  terminalClose?: boolean
  terminalRetainsFocusWorkflow?: boolean
} | null

export type EditorOpeningState = NativeResourceEditorOpeningState<
  EditorMode,
  ResourceFailure
>

export type EditorOpenRequest = {
  mode: EditorMode
  ref?: AccountKeyResourceRef
}

export type ResourceActionContext = {
  session: AccountKeyResourceSession
  collection: AccountKeyResourceCollection
  boundary: ActiveResourceBoundary
}

export type ResolveResourceActionContext = (
  ref: AccountKeyResourceRef,
  controller: AbortController,
) => Promise<ResourceActionContext | null>

export type OpenResourceSession = (
  account: DisplaySiteData,
  signal: AbortSignal,
  protectionBypassExecution?: ProtectionBypassExecution,
) => Promise<AccountKeyResourceSession | null>

export type RefreshAfterMutation = (
  targetBoundary?: ActiveResourceBoundary,
  routeTransitionId?: string,
  retryAccountIds?: readonly string[],
) => Promise<boolean>

export type DetailState = AccountKeyResourceFacts | null

export type DeleteState = {
  isOpen: boolean
  isExecuting: boolean
  ref: AccountKeyResourceRef | null
  failure: ResourceFailure | null
}

export type LoadProgress = {
  total: number
  loaded: number
  loading: number
  error: number
}

export type LoadOptionsEditor = Pick<
  AccountKeyResourceEditor,
  "loadOptions" | "fields"
>

export type Options = {
  accounts: readonly DisplaySiteData[]
  selectedAccount: string
  /** Foreground creation can own the initial reads as part of its user command. */
  inventoryExecution?: ProtectionBypassExecution
  creationIntent?: AccountKeyCreationIntent
  onCreated?: (
    account: DisplaySiteData,
    result: AccountKeyCreationResult,
  ) => void | Promise<void>
  routeParams?: Record<string, string>
  /** Echoed by the route owner only after it applies this controller's replacement. */
  routeTransition?: AccountKeyResourceRouteTransition
  replaceRoute?: AccountKeyResourceRouteReplacer
}

export type AccountKeyResourceRouteTransition = Readonly<{ id: string }>

export type AccountKeyResourceRouteReplacer = (
  params: Record<string, string>,
  transition?: AccountKeyResourceRouteTransition,
) => void

export type ActiveResourceBoundary = Pick<
  AccountKeyResourceRef,
  "accountId" | "siteType" | "scopeKey"
> & { routeKey: string }

export type ExpectedRouteTransition = {
  id: string
  generation: number
  selectedAccount: string
  accountId: string
  siteType: string
  scopeKey: string
  routeKey: string
}

export type AccountContextObservation = {
  mode: ControllerMode
  selectedAccount: string
  routeAccountId: string | undefined
  routeWorkspace: string | undefined
  context: AccountContextSnapshot | null
}

export type InFlightBoundaryMutation = {
  controller: AbortController
  promise: Promise<unknown>
}

export type AccountContextSnapshot = DisplayAccountApiSnapshot
