import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
  type AccountKeyScope,
  type AccountKeyScopeInventory,
  type EditableResourceProjection,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldOption,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { accountKeyResourceRefIdentity } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"
import type { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  type PRODUCT_ANALYTICS_ACTION_IDS,
  type PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import {
  createAutomaticProtectionBypassExecution,
  createUserCommandProtectionBypassExecution,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes } from "../constants"
import type {
  AccountContextSnapshot,
  ActiveResourceBoundary,
  ControllerMode,
  ExpectedRouteTransition,
  MutationAnalyticsMode,
} from "./accountKeyResourceControllerTypes"

export const ALL_ACCOUNT_CONCURRENCY = 4

export const AUTOMATIC_INVENTORY_EXECUTION =
  createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement,
    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
    PROTECTION_BYPASS_SURFACES.Options,
  )

export const USER_KEY_MANAGEMENT_EXECUTION =
  createUserCommandProtectionBypassExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    PROTECTION_BYPASS_SURFACES.Options,
  )

export const keyManagementAnalyticsContext = (
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
  surfaceId:
    | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader
    | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
) => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId,
  surfaceId,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

/** Records mutation outcomes with the same redacted, single-resource insights. */
export const completeKeyMutationAnalytics = (
  tracker: ReturnType<typeof startProductAnalyticsAction>,
  result:
    | typeof PRODUCT_ANALYTICS_RESULTS.Success
    | typeof PRODUCT_ANALYTICS_RESULTS.Failure,
  mode: MutationAnalyticsMode,
  siteType: string | undefined,
) => {
  tracker.complete(result, {
    ...(result === PRODUCT_ANALYTICS_RESULTS.Success
      ? {}
      : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }),
    insights: {
      mode,
      ...(siteType ? { siteType: siteType as ProductAnalyticsSiteType } : {}),
      selectedCount: 1,
    },
  })
}

export const isAccountKeyResourceRouteTransitionAcknowledged = ({
  expected,
  generation,
  mode,
  transitionId,
  selectedAccount,
  selectedRouteSiteType,
  routeAccountId,
  routeWorkspace,
}: {
  expected: ExpectedRouteTransition | null
  generation: number
  mode: ControllerMode
  transitionId: string | undefined
  selectedAccount: string
  selectedRouteSiteType: string | undefined
  routeAccountId: string | undefined
  routeWorkspace: string | undefined
}) =>
  expected !== null &&
  mode === controllerModes.Single &&
  expected.generation === generation &&
  transitionId === expected.id &&
  selectedAccount === expected.selectedAccount &&
  selectedAccount === expected.accountId &&
  selectedRouteSiteType === expected.siteType &&
  routeAccountId === expected.accountId &&
  routeWorkspace === expected.routeKey

const abortFailure = (): ResourceFailure => ({
  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
})

export const toFailure = (error: unknown): ResourceFailure =>
  error instanceof AccountKeyResourceError
    ? error.failure
    : { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected }

export const refIdentity = accountKeyResourceRefIdentity

export const refMatchesBoundary = (
  ref: Pick<AccountKeyResourceRef, "accountId" | "siteType" | "scopeKey">,
  boundary: ActiveResourceBoundary,
) =>
  ref.accountId === boundary.accountId &&
  ref.siteType === boundary.siteType &&
  ref.scopeKey === boundary.scopeKey

export const boundariesMatch = (
  left: ActiveResourceBoundary,
  right: ActiveResourceBoundary,
) => refMatchesBoundary(left, right)

export const boundaryIdentity = (
  boundary: Pick<ActiveResourceBoundary, "accountId" | "siteType" | "scopeKey">,
) => JSON.stringify([boundary.accountId, boundary.siteType, boundary.scopeKey])

export const boundaryFromResourceRef = (
  ref: AccountKeyResourceRef,
): ActiveResourceBoundary => ({
  accountId: ref.accountId,
  siteType: ref.siteType,
  scopeKey: ref.scopeKey,
  // Combined inventory has no route identity; mutations are bound by the
  // provider's canonical collection scope instead.
  routeKey: ref.scopeKey,
})

export const captureAccountContext = (
  account: DisplaySiteData,
): AccountContextSnapshot => ({
  id: account.id,
  name: account.name,
  siteType: account.siteType,
  baseUrl: account.baseUrl,
  authType: account.authType,
  userId: account.userId,
  token: account.token,
  cookieAuthSessionCookie: account.cookieAuthSessionCookie,
  tagIds: account.tagIds ? [...account.tagIds] : undefined,
})

export const accountContextsMatch = (
  left: readonly AccountContextSnapshot[],
  right: readonly AccountContextSnapshot[],
) =>
  left.length === right.length &&
  left.every((account, index) => {
    const candidate = right[index]
    return (
      candidate !== undefined &&
      account.id === candidate.id &&
      account.name === candidate.name &&
      account.siteType === candidate.siteType &&
      account.baseUrl === candidate.baseUrl &&
      account.authType === candidate.authType &&
      account.userId === candidate.userId &&
      account.token === candidate.token &&
      account.cookieAuthSessionCookie === candidate.cookieAuthSessionCookie &&
      account.tagIds?.length === candidate.tagIds?.length &&
      (account.tagIds ?? []).every(
        (tagId, tagIndex) => tagId === candidate.tagIds?.[tagIndex],
      )
    )
  })

export const resolveCreateDestinationBoundary = (
  nativeEditor: AccountKeyResourceEditor,
  values: EditableResourceProjection,
  editorBoundary: ActiveResourceBoundary,
  scopes: readonly AccountKeyScope[],
): ActiveResourceBoundary => {
  const destinationScopeKey = nativeEditor.resolveDestinationScopeKey(values)
  const destinationScope = scopes.find(
    (scope) => scope.scopeKey === destinationScopeKey,
  )
  if (!destinationScope) {
    throw new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  }
  return {
    accountId: editorBoundary.accountId,
    siteType: editorBoundary.siteType,
    scopeKey: destinationScope.scopeKey,
    routeKey: destinationScope.routeKey,
  }
}

export const mergeEditorValuesForScopeChange = (
  previousValues: EditableResourceProjection,
  nativeEditor: AccountKeyResourceEditor,
): EditableResourceProjection => {
  const dependencyFieldIds = new Set(
    nativeEditor.fields.flatMap((field) =>
      "optionLoader" in field && field.optionLoader
        ? field.optionLoader.dependsOn
        : [],
    ),
  )
  const merged: Record<string, EditableResourceProjection[string]> = {
    ...nativeEditor.initialValues,
  }
  nativeEditor.fields.forEach((field) => {
    if (
      field.readOnly ||
      dependencyFieldIds.has(field.fieldId) ||
      ("optionLoader" in field && field.optionLoader) ||
      !(field.fieldId in previousValues)
    )
      return
    const previousValue = previousValues[field.fieldId]
    if (previousValue === undefined) return
    if ("options" in field) {
      const allowed = new Set(field.options.map((option) => option.value))
      const isValid = Array.isArray(previousValue)
        ? previousValue.every((value) => allowed.has(value))
        : previousValue === null ||
          (typeof previousValue === "string" && allowed.has(previousValue))
      if (!isValid) return
    }
    merged[field.fieldId] = previousValue
  })
  return merged
}

export const resetInvalidOptionValue = (
  values: EditableResourceProjection,
  initialValues: EditableResourceProjection,
  field: ResourceFieldDescriptor,
  options: readonly ResourceFieldOption[],
): EditableResourceProjection => {
  if (field.nullable) return { ...values, [field.fieldId]: null }
  const initialValue = initialValues[field.fieldId]
  const allowed = new Set(options.map((option) => option.value))
  if (
    (typeof initialValue === "string" && allowed.has(initialValue)) ||
    (Array.isArray(initialValue) &&
      initialValue.every((value) => allowed.has(value)))
  ) {
    return { ...values, [field.fieldId]: initialValue }
  }
  if (field.type === RESOURCE_FIELD_TYPES.MultiSelect) {
    return { ...values, [field.fieldId]: [] }
  }
  if (field.required && options[0]) {
    return { ...values, [field.fieldId]: options[0].value }
  }
  const nextValues = { ...values }
  delete nextValues[field.fieldId]
  return nextValues
}

export const isAborted = (failure: ResourceFailure) =>
  failure.code === ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted

export const awaitAbortable = <T>(promise: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted)
      return reject(new AccountKeyResourceError(abortFailure()))
    const abort = () => reject(new AccountKeyResourceError(abortFailure()))
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })

export const readScopeInventory = async (
  session: AccountKeyResourceSession,
  options: { signal: AbortSignal },
): Promise<AccountKeyScopeInventory> =>
  session.listScopeInventory
    ? await session.listScopeInventory(options)
    : { scopes: await session.listScopes(options) }

export const groupAccountsByOrigin = (accounts: readonly DisplaySiteData[]) => {
  const groups = new Map<string, DisplaySiteData[]>()
  accounts.forEach((account) => {
    const origin = normalizeUrlForOriginKey(account.baseUrl, {
      stripTrailingSlashes: false,
    })
    const group = groups.get(origin)
    if (group) group.push(account)
    else groups.set(origin, [account])
  })
  return [...groups.values()]
}
