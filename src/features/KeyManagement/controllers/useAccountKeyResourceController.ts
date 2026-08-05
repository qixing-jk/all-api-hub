import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  createDisplayAccountApiContext,
  type DisplayAccountApiSnapshot,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceCollection,
  type AccountKeyResourceEditor,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
  type AccountKeyScope,
  type EditableResourceProjection,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldOption,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { mapSettledWithConcurrency } from "~/services/apiAdapters/nativeResources/concurrency"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import {
  ACCOUNT_KEY_STATUS_FILTERS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "../constants"

const MAX_COLLECTION_PAGES = 100
const ALL_ACCOUNT_CONCURRENCY = 4

const keyManagementAnalyticsContext = (
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

type StatusFilter =
  (typeof ACCOUNT_KEY_STATUS_FILTERS)[keyof typeof ACCOUNT_KEY_STATUS_FILTERS]
type ControllerMode = "idle" | "single" | "all"
type ControllerNotice = { kind: "workspace-fallback" }
type EditorMode = "create" | "edit"

type EditorState = {
  editorId: number
  mode: EditorMode
  fields: AccountKeyResourceEditor["fields"]
  initialValues: EditableResourceProjection
  values: EditableResourceProjection
  optionsByField: Record<string, readonly ResourceFieldOption[]>
  optionFailuresByField: Record<string, ResourceFailure | undefined>
  loadingFieldIds: readonly string[]
  feedback: ResourceFailure | null
  terminalClose?: boolean
} | null

type EditorOpeningState =
  | { attemptId: number; status: "idle" }
  | { attemptId: number; status: "loading" }
  | { attemptId: number; status: "failure"; failure: ResourceFailure }

type EditorOpenRequest = {
  mode: EditorMode
  ref?: AccountKeyResourceRef
  boundary: ActiveResourceBoundary
}

type DetailState = AccountKeyResourceFacts | null

type DeleteState = {
  isOpen: boolean
  isExecuting: boolean
  ref: AccountKeyResourceRef | null
  failure: ResourceFailure | null
}

type LoadProgress = {
  total: number
  loaded: number
  loading: number
  error: number
}

type OpenAccountResources = (
  account: DisplaySiteData,
  options: { signal: AbortSignal },
) => Promise<AccountKeyResourceSession | null>

type LoadOptionsEditor = Pick<
  AccountKeyResourceEditor,
  "loadOptions" | "fields"
>

type Options = {
  accounts: readonly DisplaySiteData[]
  selectedAccount: string
  routeParams?: Record<string, string>
  replaceRoute?: (params: Record<string, string>) => void
}

type ActiveResourceBoundary = Pick<
  AccountKeyResourceRef,
  "accountId" | "siteType" | "scopeKey"
> & { routeKey: string }

type InFlightBoundaryMutation = {
  controller: AbortController
  promise: Promise<unknown>
}

const abortFailure = (): ResourceFailure => ({
  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
})

const toFailure = (error: unknown): ResourceFailure =>
  error instanceof AccountKeyResourceError
    ? error.failure
    : { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected }

const refIdentity = (ref: AccountKeyResourceRef) =>
  JSON.stringify([ref.accountId, ref.siteType, ref.scopeKey, ref.resourceId])

const refMatchesBoundary = (
  ref: AccountKeyResourceRef,
  boundary: ActiveResourceBoundary,
) =>
  ref.accountId === boundary.accountId &&
  ref.siteType === boundary.siteType &&
  ref.scopeKey === boundary.scopeKey

const boundariesMatch = (
  left: ActiveResourceBoundary,
  right: ActiveResourceBoundary,
) =>
  left.accountId === right.accountId &&
  left.siteType === right.siteType &&
  left.scopeKey === right.scopeKey

const boundaryIdentity = (boundary: ActiveResourceBoundary) =>
  JSON.stringify([boundary.accountId, boundary.siteType, boundary.scopeKey])

type AccountContextSnapshot = DisplayAccountApiSnapshot

const captureAccountContext = (
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

const accountContextsMatch = (
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

const resolveCreateDestinationBoundary = (
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

const mergeEditorValuesForScopeChange = (
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

const resetInvalidOptionValue = (
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
  if (field.type === "multi-select") {
    return { ...values, [field.fieldId]: [] }
  }
  if (field.required && options[0]) {
    return { ...values, [field.fieldId]: options[0].value }
  }
  const nextValues = { ...values }
  delete nextValues[field.fieldId]
  return nextValues
}

const isAborted = (failure: ResourceFailure) =>
  failure.code === ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted

const awaitAbortable = <T>(promise: Promise<T>, signal: AbortSignal) =>
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

const collectAll = async (
  collection: AccountKeyResourceCollection,
  search: string,
  signal: AbortSignal,
) => {
  const rows: AccountKeyResourceFacts[] = []
  const refs = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined

  for (let pageCount = 0; pageCount < MAX_COLLECTION_PAGES; pageCount += 1) {
    const page = await awaitAbortable(
      collection.list(
        {
          ...(search ? { search } : {}),
          ...(cursor ? { cursor } : {}),
        },
        { signal },
      ),
      signal,
    )
    for (const item of page.items) {
      const identity = refIdentity(item.ref)
      if (refs.has(identity)) {
        throw new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        })
      }
      refs.add(identity)
      rows.push(item)
    }
    if (!page.nextCursor) return rows
    if (cursors.has(page.nextCursor)) {
      throw new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
      })
    }
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }

  throw new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
  })
}

type IndexedAccount = { account: DisplaySiteData; index: number }

const groupAccountsByOrigin = (accounts: readonly DisplaySiteData[]) => {
  const groups = new Map<string, IndexedAccount[]>()
  accounts.forEach((account, index) => {
    const origin = normalizeUrlForOriginKey(account.baseUrl, {
      stripTrailingSlashes: false,
    })
    const group = groups.get(origin)
    if (group) group.push({ account, index })
    else groups.set(origin, [{ account, index }])
  })
  return [...groups.values()]
}

/** Owns native account-key resource loading and mutation state without exposing sessions. */
export function useAccountKeyResourceController({
  accounts,
  selectedAccount,
  routeParams,
  replaceRoute,
}: Options) {
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const routeRef = useRef(routeParams)
  routeRef.current = routeParams
  const replaceRouteRef = useRef(replaceRoute)
  replaceRouteRef.current = replaceRoute
  const accountContextSnapshotsRef = useRef<readonly AccountContextSnapshot[]>(
    [],
  )
  const accountContextRevisionRef = useRef(0)
  const nextAccountContextSnapshots = accounts.map(captureAccountContext)
  if (
    !accountContextsMatch(
      accountContextSnapshotsRef.current,
      nextAccountContextSnapshots,
    )
  ) {
    accountContextSnapshotsRef.current = nextAccountContextSnapshots
    accountContextRevisionRef.current += 1
  }
  const accountKey = accounts
    .map((account) => `${account.id}:${account.siteType}`)
    .join("|")
    .concat(`:${accountContextRevisionRef.current}`)
  const routeAccountId = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]
  const routeWorkspace = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]
  const mode: ControllerMode = !selectedAccount
    ? "idle"
    : selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? "all"
      : "single"

  const [scopes, setScopes] = useState<readonly AccountKeyScope[]>([])
  const [selectedScope, setSelectedScope] = useState<AccountKeyScope | null>(
    null,
  )
  const [loadingResourceBoundary, setLoadingResourceBoundary] =
    useState<ActiveResourceBoundary | null>(null)
  const [acceptedRows, setAcceptedRows] = useState<
    readonly AccountKeyResourceFacts[]
  >([])
  const [failures, setFailures] = useState<Record<string, ResourceFailure>>({})
  const [progress, setProgress] = useState<LoadProgress>({
    total: 0,
    loaded: 0,
    loading: 0,
    error: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [notice, setNotice] = useState<ControllerNotice | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ACCOUNT_KEY_STATUS_FILTERS.All,
  )
  const [detail, setDetail] = useState<DetailState>(null)
  const [editor, setEditor] = useState<EditorState>(null)
  const editorStateRef = useRef<EditorState>(editor)
  editorStateRef.current = editor
  const [editorOpening, setEditorOpening] = useState<EditorOpeningState>({
    attemptId: 0,
    status: "idle",
  })
  const [createdSecret, setCreatedSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    isExecuting: false,
    ref: null,
    failure: null,
  })
  const [freshReadLocks, setFreshReadLocks] = useState<
    Record<string, ActiveResourceBoundary>
  >({})
  const selectedAccountData = accounts.find(
    (account) => account.id === selectedAccount,
  )
  const currentResourceBoundary =
    selectedScope && selectedAccountData
      ? {
          accountId: selectedAccount,
          siteType: selectedAccountData.siteType,
          scopeKey: selectedScope.scopeKey,
          routeKey: selectedScope.routeKey,
        }
      : loadingResourceBoundary
  const freshReadRequired =
    currentResourceBoundary !== null &&
    Object.values(freshReadLocks).some((boundary) =>
      boundariesMatch(boundary, currentResourceBoundary),
    )
  const generation = useRef(0)
  const loadAbort = useRef<AbortController | null>(null)
  const loadInProgress = useRef(false)
  const actionAbort = useRef<AbortController | null>(null)
  const collectionRef = useRef<AccountKeyResourceCollection | null>(null)
  const sessionRef = useRef<AccountKeyResourceSession | null>(null)
  const activeResourceBoundaryRef = useRef<ActiveResourceBoundary | null>(null)
  const editorRef = useRef<AccountKeyResourceEditor | null>(null)
  const editorBoundaryRef = useRef<ActiveResourceBoundary | null>(null)
  const editorFieldGenerations = useRef<Record<string, number>>({})
  const editorGeneration = useRef(0)
  const editorInstanceId = useRef(0)
  const editorOpeningAttemptId = useRef(0)
  const editorOpeningRef = useRef<EditorOpeningState>(editorOpening)
  editorOpeningRef.current = editorOpening
  const editorOpeningRequestRef = useRef<EditorOpenRequest | null>(null)
  const editorFieldAbortControllers = useRef(new Map<string, AbortController>())
  const mutationsByBoundary = useRef(
    new Map<string, InFlightBoundaryMutation>(),
  )

  // Async editor work can settle before React commits this render. Keep the
  // controller's authoritative projection in sync with every queued update.
  const transitionEditor = useCallback(
    (transition: (current: EditorState) => EditorState) => {
      const next = transition(editorStateRef.current)
      editorStateRef.current = next
      setEditor(next)
      return next
    },
    [],
  )

  const transitionEditorOpening = useCallback((next: EditorOpeningState) => {
    editorOpeningRef.current = next
    setEditorOpening(next)
  }, [])

  const requireFreshRead = useCallback((boundary: ActiveResourceBoundary) => {
    const identity = boundaryIdentity(boundary)
    setFreshReadLocks((current) => ({ ...current, [identity]: boundary }))
  }, [])

  const acceptFreshRead = useCallback((boundary: ActiveResourceBoundary) => {
    const identity = boundaryIdentity(boundary)
    setFreshReadLocks((current) => {
      if (!(identity in current)) return current
      const next = { ...current }
      delete next[identity]
      return next
    })
  }, [])

  const abortEditorFieldLoads = useCallback(() => {
    editorGeneration.current += 1
    editorFieldAbortControllers.current.forEach((controller) =>
      controller.abort(),
    )
    editorFieldAbortControllers.current.clear()
    editorFieldGenerations.current = {}
  }, [])

  const clearActiveResourceRefs = useCallback(() => {
    sessionRef.current = null
    collectionRef.current = null
    activeResourceBoundaryRef.current = null
    editorRef.current = null
    editorBoundaryRef.current = null
  }, [])

  const clearTerminalResourceState = useCallback(() => {
    clearActiveResourceRefs()
    editorOpeningRequestRef.current = null
    transitionEditorOpening({
      attemptId: editorOpeningAttemptId.current,
      status: "idle",
    })
    setDetail(null)
    transitionEditor(() => null)
    setCreatedSecret(null)
    setDeleteState({
      isOpen: false,
      isExecuting: false,
      ref: null,
      failure: null,
    })
  }, [clearActiveResourceRefs, transitionEditor, transitionEditorOpening])

  const defaultOpenResources = useCallback<OpenAccountResources>(
    async (account, { signal }) => {
      const context = createDisplayAccountApiContext(account)
      if (!context.accountKeyResources) return null
      return await context.accountKeyResources.open(
        {
          account: {
            id: account.id,
            name: account.name,
            siteType: account.siteType,
          },
          request: context.request,
        },
        { signal },
      )
    },
    [],
  )

  const openSession = useCallback(
    async (account: DisplaySiteData, signal: AbortSignal) => {
      return await awaitAbortable(
        defaultOpenResources(account, { signal }),
        signal,
      )
    },
    [defaultOpenResources],
  )

  const clearDialogs = useCallback(() => {
    actionAbort.current?.abort()
    actionAbort.current = null
    abortEditorFieldLoads()
    clearTerminalResourceState()
  }, [abortEditorFieldLoads, clearTerminalResourceState])

  const loadEditorOptions = useCallback(
    async (
      editorId: number,
      fieldId: string,
      values?: EditableResourceProjection,
      editorOverride?: LoadOptionsEditor,
    ) => {
      const currentEditorState = editorStateRef.current
      const nativeEditor = editorOverride ?? editorRef.current
      if (
        !nativeEditor?.loadOptions ||
        !currentEditorState ||
        currentEditorState.editorId !== editorId
      )
        return
      const editorVersion = editorGeneration.current
      const nextGeneration = (editorFieldGenerations.current[fieldId] ?? 0) + 1
      editorFieldGenerations.current[fieldId] = nextGeneration
      editorFieldAbortControllers.current.get(fieldId)?.abort()
      const controller = new AbortController()
      editorFieldAbortControllers.current.set(fieldId, controller)
      const requestedValues = values ?? currentEditorState?.values ?? {}
      const requestedField = nativeEditor.fields.find(
        (field) => field.fieldId === fieldId,
      )
      const nextValues =
        currentEditorState && requestedField
          ? resetInvalidOptionValue(
              requestedValues,
              currentEditorState.initialValues,
              requestedField,
              [],
            )
          : requestedValues
      transitionEditor((current) => {
        if (!current || current.editorId !== editorId) return current
        const field = current.fields.find(
          (candidate) => candidate.fieldId === fieldId,
        )
        const optionFailuresByField = { ...current.optionFailuresByField }
        delete optionFailuresByField[fieldId]
        return {
          ...current,
          values: field
            ? resetInvalidOptionValue(
                current.values,
                current.initialValues,
                field,
                [],
              )
            : current.values,
          optionsByField: { ...current.optionsByField, [fieldId]: [] },
          optionFailuresByField,
          loadingFieldIds: [...new Set([...current.loadingFieldIds, fieldId])],
        }
      })
      try {
        const options = await nativeEditor.loadOptions(fieldId, nextValues, {
          signal: controller.signal,
        })
        if (
          editorGeneration.current !== editorVersion ||
          editorFieldGenerations.current[fieldId] !== nextGeneration
        )
          return
        transitionEditor((current) => {
          if (!current || current.editorId !== editorId) return current
          const value = current.values[fieldId]
          const field = current.fields.find(
            (candidate) => candidate.fieldId === fieldId,
          )
          const hasInvalidOption =
            typeof value === "string"
              ? value.length > 0 &&
                !options.some((option) => option.value === value)
              : Array.isArray(value)
                ? value.some(
                    (entry) =>
                      !options.some((option) => option.value === entry),
                  )
                : false
          const valuesWithInvalidOptionCleared =
            field && hasInvalidOption
              ? resetInvalidOptionValue(
                  current.values,
                  current.initialValues,
                  field,
                  options,
                )
              : current.values
          return {
            ...current,
            values: valuesWithInvalidOptionCleared,
            optionsByField: {
              ...current.optionsByField,
              [fieldId]: options,
            },
            optionFailuresByField: {
              ...current.optionFailuresByField,
              [fieldId]: undefined,
            },
            loadingFieldIds: current.loadingFieldIds.filter(
              (id) => id !== fieldId,
            ),
          }
        })
      } catch (error) {
        if (
          editorGeneration.current !== editorVersion ||
          editorFieldGenerations.current[fieldId] !== nextGeneration
        )
          return
        const failure = toFailure(error)
        transitionEditor((current) =>
          current && current.editorId === editorId
            ? {
                ...current,
                optionFailuresByField: {
                  ...current.optionFailuresByField,
                  ...(isAborted(failure) ? {} : { [fieldId]: failure }),
                },
                loadingFieldIds: current.loadingFieldIds.filter(
                  (id) => id !== fieldId,
                ),
              }
            : current,
        )
      } finally {
        if (editorFieldAbortControllers.current.get(fieldId) === controller) {
          editorFieldAbortControllers.current.delete(fieldId)
        }
      }
    },
    [transitionEditor],
  )

  const load = useCallback(
    async (
      options: {
        preserveCreatedSecret?: boolean
        preserveEditor?: boolean
        targetScopeKey?: string
      } = {},
    ) => {
      loadAbort.current?.abort()
      const preservedEditor = options.preserveEditor
        ? editorStateRef.current
        : null
      const preservedEditorId = preservedEditor?.editorId
      const preservedEditorBoundary = editorBoundaryRef.current
      const preserveEditor =
        preservedEditor?.mode === "create" &&
        preservedEditorBoundary?.accountId === selectedAccount
      const controller = new AbortController()
      loadAbort.current = controller
      const current = ++generation.current
      loadInProgress.current = mode !== "idle"
      if (options.preserveCreatedSecret) {
        actionAbort.current?.abort()
        actionAbort.current = null
        abortEditorFieldLoads()
        editorRef.current = null
        setDetail(null)
        transitionEditor(() => null)
        setDeleteState({
          isOpen: false,
          isExecuting: false,
          ref: null,
          failure: null,
        })
      } else if (preserveEditor) {
        actionAbort.current?.abort()
        actionAbort.current = null
        abortEditorFieldLoads()
        setDetail(null)
        setCreatedSecret(null)
        setDeleteState({
          isOpen: false,
          isExecuting: false,
          ref: null,
          failure: null,
        })
      } else {
        clearDialogs()
      }
      setScopes([])
      setSelectedScope(null)
      setLoadingResourceBoundary(null)
      setAcceptedRows([])
      setFailures({})
      setNotice(null)
      setIsLoading(mode !== "idle")

      if (mode === "idle") {
        clearTerminalResourceState()
        loadInProgress.current = false
        setProgress({ total: 0, loaded: 0, loading: 0, error: 0 })
        setIsLoading(false)
        return false
      }

      const activeAccounts = accountsRef.current.filter((account) =>
        mode === "all" ? true : account.id === selectedAccount,
      )
      setProgress({
        total: activeAccounts.length,
        loaded: 0,
        loading: activeAccounts.length,
        error: 0,
      })

      const acceptProgress = (loaded: boolean) => {
        if (current !== generation.current) return
        setProgress((previous) => ({
          ...previous,
          loaded: previous.loaded + (loaded ? 1 : 0),
          error: previous.error + (loaded ? 0 : 1),
          loading: Math.max(0, previous.loading - 1),
        }))
      }

      try {
        if (mode === "all") {
          clearActiveResourceRefs()
          const loadAccount = async (account: DisplaySiteData) => {
            const session = await openSession(account, controller.signal)
            if (!session) return [] as AccountKeyResourceFacts[]
            const scope = await awaitAbortable(
              session.resolveDefaultScope({ signal: controller.signal }),
              controller.signal,
            )
            const collection = await awaitAbortable(
              session.openCollection(scope.scopeKey, {
                signal: controller.signal,
              }),
              controller.signal,
            )
            return await collectAll(
              collection,
              search.trim(),
              controller.signal,
            )
          }
          const originGroups = groupAccountsByOrigin(activeAccounts)
          const settledGroups = await mapSettledWithConcurrency(
            originGroups,
            ALL_ACCOUNT_CONCURRENCY,
            async (group) => {
              const results: Array<{
                account: DisplaySiteData
                index: number
                result: PromiseSettledResult<AccountKeyResourceFacts[]>
              }> = []
              for (const entry of group) {
                const [result] = await Promise.allSettled([
                  loadAccount(entry.account),
                ])
                if (current === generation.current) {
                  const failure =
                    result.status === "rejected"
                      ? toFailure(result.reason)
                      : null
                  if (!failure || !isAborted(failure)) {
                    acceptProgress(result.status === "fulfilled")
                  }
                }
                results.push({ ...entry, result })
              }
              return results
            },
          )
          if (current !== generation.current) return false
          const settled = settledGroups
            .flatMap((groupResult, groupIndex) => {
              if (groupResult.status === "fulfilled") return groupResult.value
              return originGroups[groupIndex].map((entry) => ({
                ...entry,
                result: {
                  status: "rejected" as const,
                  reason: groupResult.reason,
                },
              }))
            })
            .sort((left, right) => left.index - right.index)
          const rows: AccountKeyResourceFacts[] = []
          const nextFailures: Record<string, ResourceFailure> = {}
          settled.forEach(({ account, result }) => {
            if (result.status === "fulfilled") {
              rows.push(...result.value)
              return
            }
            const failure = toFailure(result.reason)
            if (!isAborted(failure)) nextFailures[account.id] = failure
          })
          setAcceptedRows(rows)
          setFailures(nextFailures)
          return true
        }

        const account = activeAccounts[0]
        if (!account) {
          clearTerminalResourceState()
          return false
        }
        const session = await openSession(account, controller.signal)
        if (!session) {
          clearTerminalResourceState()
          acceptProgress(true)
          return true
        }
        const [defaultScope, listedScopes] = await Promise.all([
          awaitAbortable(
            session.resolveDefaultScope({ signal: controller.signal }),
            controller.signal,
          ),
          awaitAbortable(
            session.listScopes({ signal: controller.signal }),
            controller.signal,
          ),
        ])
        if (current !== generation.current) return false
        const availableScopes = listedScopes.some(
          (scope) => scope.scopeKey === defaultScope.scopeKey,
        )
          ? listedScopes
          : [defaultScope, ...listedScopes]
        const requestedRouteKey =
          routeRef.current?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]?.trim()
        const routeMatchesAccount =
          routeRef.current?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId] ===
          account.id
        const requestedScope =
          routeMatchesAccount && requestedRouteKey
            ? availableScopes.find(
                (scope) => scope.routeKey === requestedRouteKey,
              )
            : undefined
        const targetScope = options.targetScopeKey
          ? availableScopes.find(
              (candidate) => candidate.scopeKey === options.targetScopeKey,
            )
          : undefined
        if (options.targetScopeKey && !targetScope) {
          throw new AccountKeyResourceError({
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
          })
        }
        const canonicalDefaultScope =
          availableScopes.find(
            (scope) => scope.scopeKey === defaultScope.scopeKey,
          ) ?? defaultScope
        const scope = targetScope ?? requestedScope ?? canonicalDefaultScope
        const needsCanonicalRoute =
          !routeMatchesAccount ||
          requestedScope === undefined ||
          (!!targetScope && targetScope.scopeKey !== requestedScope.scopeKey)
        if (needsCanonicalRoute) {
          if (
            !targetScope &&
            requestedRouteKey &&
            (!routeMatchesAccount || requestedScope === undefined)
          ) {
            setNotice({ kind: "workspace-fallback" })
          }
          replaceRouteRef.current?.({
            [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: account.id,
            [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: scope.routeKey,
          })
        }
        const activeBoundary: ActiveResourceBoundary = {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: scope.scopeKey,
          routeKey: scope.routeKey,
        }
        setLoadingResourceBoundary(activeBoundary)
        const collection = await awaitAbortable(
          session.openCollection(scope.scopeKey, { signal: controller.signal }),
          controller.signal,
        )
        const rows = await collectAll(
          collection,
          search.trim(),
          controller.signal,
        )
        if (current !== generation.current) return false
        let rehydratedEditor: {
          nativeEditor: AccountKeyResourceEditor
          state: Exclude<EditorState, null>
        } | null = null
        if (preserveEditor && preservedEditorId !== undefined) {
          const nativeEditor = await awaitAbortable(
            session.openCreateEditor(scope.scopeKey, {
              signal: controller.signal,
            }),
            controller.signal,
          )
          if (current !== generation.current) return false
          const currentEditor = editorStateRef.current
          if (
            currentEditor?.mode === "create" &&
            currentEditor.editorId === preservedEditorId
          ) {
            const rehydratedValues = mergeEditorValuesForScopeChange(
              currentEditor.values,
              nativeEditor,
            )
            rehydratedEditor = {
              nativeEditor,
              state: {
                // Rehydration replaces the native contract, so it must also
                // replace the dialog session that owns dynamic option caches.
                editorId: ++editorInstanceId.current,
                mode: "create",
                fields: nativeEditor.fields,
                initialValues: nativeEditor.initialValues,
                values: rehydratedValues,
                optionsByField: {},
                optionFailuresByField: {},
                loadingFieldIds: [],
                feedback: null,
              },
            }
          }
        }
        if (current !== generation.current) return false
        sessionRef.current = session
        collectionRef.current = collection
        activeResourceBoundaryRef.current = activeBoundary
        editorRef.current = rehydratedEditor?.nativeEditor ?? null
        editorBoundaryRef.current = rehydratedEditor ? activeBoundary : null
        if (rehydratedEditor) transitionEditor(() => rehydratedEditor.state)
        acceptFreshRead(activeBoundary)
        setLoadingResourceBoundary(null)
        setScopes(availableScopes)
        setSelectedScope(scope)
        setAcceptedRows(rows)
        acceptProgress(true)
        return true
      } catch (error) {
        const failure = toFailure(error)
        if (current === generation.current && !isAborted(failure)) {
          clearTerminalResourceState()
          const account = activeAccounts[0]
          if (account) setFailures({ [account.id]: failure })
          acceptProgress(false)
        }
        return false
      } finally {
        if (current === generation.current) {
          loadInProgress.current = false
          setLoadingResourceBoundary(null)
          setIsLoading(false)
          if (loadAbort.current === controller) loadAbort.current = null
        }
      }
    },
    [
      abortEditorFieldLoads,
      acceptFreshRead,
      clearActiveResourceRefs,
      clearTerminalResourceState,
      clearDialogs,
      mode,
      openSession,
      search,
      selectedAccount,
      transitionEditor,
    ],
  )

  useEffect(() => {
    void load({
      preserveEditor: mode === "single" && routeAccountId === selectedAccount,
    })
    return () => {
      generation.current += 1
      loadAbort.current?.abort()
    }
  }, [accountKey, load, mode, routeAccountId, routeWorkspace, selectedAccount])

  useEffect(
    () => () => {
      generation.current += 1
      loadAbort.current?.abort()
      actionAbort.current?.abort()
      mutationsByBoundary.current.forEach(({ controller }) =>
        controller.abort(),
      )
      mutationsByBoundary.current.clear()
      editorFieldAbortControllers.current.forEach((controller) =>
        controller.abort(),
      )
      editorFieldAbortControllers.current.clear()
      sessionRef.current = null
      collectionRef.current = null
      activeResourceBoundaryRef.current = null
      editorRef.current = null
      editorBoundaryRef.current = null
    },
    [],
  )

  const isCurrentResourceRef = useCallback(
    (ref: AccountKeyResourceRef) => {
      if (mode !== "single") return false
      const boundary = activeResourceBoundaryRef.current
      return !!boundary && refMatchesBoundary(ref, boundary)
    },
    [mode],
  )

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return acceptedRows.filter((row) => {
      const matchesStatus =
        statusFilter === ACCOUNT_KEY_STATUS_FILTERS.All ||
        row.status === statusFilter
      if (!matchesStatus) return false
      if (!normalizedSearch) return true
      return [
        row.displayName,
        row.maskedLabel,
        ...(row.searchValues ?? []),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [acceptedRows, search, statusFilter])

  const refresh = useCallback(
    async (targetBoundary?: ActiveResourceBoundary) => {
      const account = accountsRef.current.find(
        (candidate) => candidate.id === selectedAccount,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
        ),
      )
      const accepted = await load({
        preserveCreatedSecret: true,
        ...(targetBoundary ? { targetScopeKey: targetBoundary.scopeKey } : {}),
      })
      tracker.complete(
        accepted
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          ...(accepted
            ? {}
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }),
          insights: {
            mode:
              mode === "all"
                ? PRODUCT_ANALYTICS_MODE_IDS.All
                : PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(account
              ? { siteType: account.siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount:
              mode === "all" ? accountsRef.current.length : account ? 1 : 0,
          },
        },
      )
      return accepted
    },
    [load, mode, selectedAccount],
  )

  const openDetail = useCallback(
    async (ref: AccountKeyResourceRef) => {
      const collection = collectionRef.current
      if (
        mode !== "single" ||
        loadInProgress.current ||
        !collection ||
        !isCurrentResourceRef(ref)
      )
        return
      actionAbort.current?.abort()
      const controller = new AbortController()
      actionAbort.current = controller
      const current = generation.current
      try {
        const facts = await awaitAbortable(
          collection.get(ref, { signal: controller.signal }),
          controller.signal,
        )
        if (current === generation.current) setDetail(facts)
      } catch {
        // Detail failures are intentionally surfaced through an empty detail state.
      }
    },
    [isCurrentResourceRef, mode],
  )

  const closeDetail = useCallback(() => setDetail(null), [])

  const selectScope = useCallback(
    (scopeKey: string) => {
      if (mode !== "single") return false
      const scope = scopes.find((candidate) => candidate.scopeKey === scopeKey)
      if (!scope) return false
      replaceRouteRef.current?.({
        [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: selectedAccount,
        [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: scope.routeKey,
      })
      return true
    },
    [mode, scopes, selectedAccount],
  )

  const openEditor = useCallback(
    async (
      editorMode: EditorMode,
      ref?: AccountKeyResourceRef,
      retryAttemptId?: number,
    ) => {
      const boundary = activeResourceBoundaryRef.current
      if (
        mode !== "single" ||
        loadInProgress.current ||
        freshReadRequired ||
        !boundary
      )
        return
      const session = sessionRef.current
      const collection = collectionRef.current
      if (
        !session ||
        (editorMode === "edit" &&
          (!collection || !ref || !isCurrentResourceRef(ref)))
      )
        return
      const previousOpening = editorOpeningRef.current
      if (
        retryAttemptId !== undefined
          ? previousOpening.status !== "failure" ||
            previousOpening.attemptId !== retryAttemptId
          : previousOpening.status === "loading"
      )
        return
      // A replacement editor is a new session even while its provider open is
      // pending, so no callback from the prior session may update it.
      abortEditorFieldLoads()
      actionAbort.current?.abort()
      editorRef.current = null
      editorBoundaryRef.current = null
      transitionEditor(() => null)
      const attemptId = ++editorOpeningAttemptId.current
      editorOpeningRequestRef.current = { mode: editorMode, ref, boundary }
      transitionEditorOpening({ attemptId, status: "loading" })
      const controller = new AbortController()
      actionAbort.current = controller
      const current = generation.current
      try {
        const nativeEditor =
          editorMode === "create"
            ? await awaitAbortable(
                session.openCreateEditor(boundary.scopeKey, {
                  signal: controller.signal,
                }),
                controller.signal,
              )
            : await awaitAbortable(
                collection!.openEditEditor(ref!, { signal: controller.signal }),
                controller.signal,
              )
        if (
          current !== generation.current ||
          editorOpeningRef.current.status !== "loading" ||
          editorOpeningRef.current.attemptId !== attemptId ||
          !boundariesMatch(
            activeResourceBoundaryRef.current ?? boundary,
            boundary,
          )
        )
          return
        editorRef.current = nativeEditor
        editorBoundaryRef.current = boundary
        transitionEditor(() => ({
          editorId: ++editorInstanceId.current,
          mode: editorMode,
          fields: nativeEditor.fields,
          initialValues: nativeEditor.initialValues,
          values: nativeEditor.initialValues,
          optionsByField: {},
          optionFailuresByField: {},
          loadingFieldIds: [],
          feedback: null,
        }))
        editorOpeningRequestRef.current = null
        transitionEditorOpening({ attemptId, status: "idle" })
      } catch (error) {
        const failure = toFailure(error)
        if (
          current !== generation.current ||
          isAborted(failure) ||
          editorOpeningRef.current.status !== "loading" ||
          editorOpeningRef.current.attemptId !== attemptId
        )
          return
        transitionEditorOpening({
          attemptId,
          status: "failure",
          failure,
        })
      }
    },
    [
      abortEditorFieldLoads,
      freshReadRequired,
      isCurrentResourceRef,
      mode,
      transitionEditor,
      transitionEditorOpening,
    ],
  )

  const retryEditorOpening = useCallback(
    (attemptId: number) => {
      const opening = editorOpeningRef.current
      const request = editorOpeningRequestRef.current
      if (
        opening.status !== "failure" ||
        opening.attemptId !== attemptId ||
        !request
      )
        return
      void openEditor(request.mode, request.ref, attemptId)
    },
    [openEditor],
  )

  const cancelEditorOpening = useCallback(
    (attemptId: number) => {
      const opening = editorOpeningRef.current
      if (
        opening.attemptId !== attemptId ||
        (opening.status !== "loading" && opening.status !== "failure")
      )
        return
      // Advance the generation before aborting so a provider that ignores its
      // signal cannot publish a late editor after the launch was dismissed.
      const nextAttemptId = ++editorOpeningAttemptId.current
      actionAbort.current?.abort()
      actionAbort.current = null
      editorOpeningRequestRef.current = null
      transitionEditorOpening({ attemptId: nextAttemptId, status: "idle" })
    },
    [transitionEditorOpening],
  )

  const closeEditor = useCallback(
    (editorId: number) => {
      if (editorStateRef.current?.editorId !== editorId) return
      actionAbort.current?.abort()
      abortEditorFieldLoads()
      editorRef.current = null
      editorBoundaryRef.current = null
      editorOpeningRequestRef.current = null
      transitionEditorOpening({
        attemptId: editorOpeningAttemptId.current,
        status: "idle",
      })
      transitionEditor(() => null)
    },
    [abortEditorFieldLoads, transitionEditor, transitionEditorOpening],
  )

  const setEditorValues = useCallback(
    (editorId: number, values: EditableResourceProjection) => {
      transitionEditor((current) =>
        current?.editorId === editorId ? { ...current, values } : current,
      )
    },
    [transitionEditor],
  )

  const submitEditor = useCallback(
    async (editorId: number, values: EditableResourceProjection) => {
      const nativeEditor = editorRef.current
      const currentEditorState = editorStateRef.current
      const activeBoundary = activeResourceBoundaryRef.current
      const editorBoundary = editorBoundaryRef.current
      const editorVersion = editorGeneration.current
      if (
        mode !== "single" ||
        loadInProgress.current ||
        !nativeEditor ||
        !currentEditorState ||
        currentEditorState.editorId !== editorId ||
        !activeBoundary ||
        !editorBoundary ||
        !boundariesMatch(activeBoundary, editorBoundary) ||
        freshReadRequired
      )
        return
      const validation = nativeEditor.validate(values)
      if (!validation.valid) {
        transitionEditor((current) =>
          current && current.editorId === editorId
            ? {
                ...current,
                feedback: {
                  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
                  fieldIssues: validation.issues,
                },
              }
            : current,
        )
        return
      }
      const current = generation.current
      const submitMode = currentEditorState.mode
      let intendedBoundary: ActiveResourceBoundary
      try {
        intendedBoundary =
          submitMode === "create"
            ? resolveCreateDestinationBoundary(
                nativeEditor,
                values,
                editorBoundary,
                scopes,
              )
            : editorBoundary
      } catch (error) {
        const failure = toFailure(error)
        transitionEditor((previous) =>
          previous && previous.editorId === editorId
            ? { ...previous, feedback: failure }
            : previous,
        )
        return
      }
      const mutationIdentity = boundaryIdentity(intendedBoundary)
      const existingMutation = mutationsByBoundary.current.get(mutationIdentity)
      if (existingMutation) return existingMutation.promise
      const account = accountsRef.current.find(
        (candidate) => candidate.id === editorBoundary.accountId,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          submitMode === "create"
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      const controller = new AbortController()
      actionAbort.current = controller
      const run = nativeEditor
        .submit(values, { signal: controller.signal })
        .then(async (result) => {
          if (
            current !== generation.current ||
            editorGeneration.current !== editorVersion ||
            editorStateRef.current?.editorId !== editorId
          ) {
            requireFreshRead(intendedBoundary)
            tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
              insights: {
                mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
                ...(account
                  ? { siteType: account.siteType as ProductAnalyticsSiteType }
                  : {}),
                selectedCount: 1,
              },
            })
            return
          }
          const returnedScope = scopes.find(
            (scope) => scope.scopeKey === result.facts.ref.scopeKey,
          )
          const returnedBoundary =
            returnedScope &&
            result.facts.ref.accountId === editorBoundary.accountId &&
            result.facts.ref.siteType === editorBoundary.siteType
              ? {
                  accountId: result.facts.ref.accountId,
                  siteType: result.facts.ref.siteType,
                  scopeKey: returnedScope.scopeKey,
                  routeKey: returnedScope.routeKey,
                }
              : intendedBoundary
          if (result.createdSecret) setCreatedSecret(result.createdSecret)
          editorRef.current = null
          editorBoundaryRef.current = null
          transitionEditor((activeEditor) =>
            activeEditor?.editorId === editorId
              ? { ...activeEditor, terminalClose: true }
              : activeEditor,
          )
          const accepted = await refresh(returnedBoundary)
          // Refresh may replace the selected collection and clear the editor.
          // Re-publish this terminal shell so its Modal can settle the opener.
          transitionEditor((activeEditor) =>
            activeEditor === null
              ? { ...currentEditorState, terminalClose: true }
              : activeEditor?.editorId === editorId
                ? { ...activeEditor, terminalClose: true }
                : activeEditor,
          )
          if (!accepted) requireFreshRead(returnedBoundary)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
              ...(account
                ? { siteType: account.siteType as ProductAnalyticsSiteType }
                : {}),
              selectedCount: 1,
            },
          })
        })
        .catch(async (error: unknown) => {
          const failure = toFailure(error)
          if (
            current !== generation.current ||
            editorGeneration.current !== editorVersion ||
            editorStateRef.current?.editorId !== editorId
          ) {
            if (
              failure.code ===
              ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
            )
              requireFreshRead(intendedBoundary)
            tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              insights: {
                mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
                ...(account
                  ? { siteType: account.siteType as ProductAnalyticsSiteType }
                  : {}),
                selectedCount: 1,
              },
            })
            return
          }
          transitionEditor((previous) =>
            previous && previous.editorId === editorId
              ? { ...previous, feedback: failure }
              : previous,
          )
          if (
            failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          ) {
            requireFreshRead(intendedBoundary)
            await refresh(intendedBoundary)
          }
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
              ...(account
                ? { siteType: account.siteType as ProductAnalyticsSiteType }
                : {}),
              selectedCount: 1,
            },
          })
        })
        .finally(() => {
          if (
            mutationsByBoundary.current.get(mutationIdentity)?.promise === run
          )
            mutationsByBoundary.current.delete(mutationIdentity)
          if (actionAbort.current === controller) actionAbort.current = null
        })
      mutationsByBoundary.current.set(mutationIdentity, {
        controller,
        promise: run,
      })
      return run
    },
    [
      freshReadRequired,
      mode,
      refresh,
      requireFreshRead,
      scopes,
      transitionEditor,
    ],
  )

  const openDelete = useCallback(
    (ref: AccountKeyResourceRef) => {
      if (
        mode !== "single" ||
        loadInProgress.current ||
        freshReadRequired ||
        !collectionRef.current ||
        !isCurrentResourceRef(ref)
      )
        return false
      setDeleteState({ isOpen: true, isExecuting: false, ref, failure: null })
      return true
    },
    [freshReadRequired, isCurrentResourceRef, mode],
  )

  const cancelDelete = useCallback(() => {
    if (!deleteState.isExecuting) {
      setDeleteState({
        isOpen: false,
        isExecuting: false,
        ref: null,
        failure: null,
      })
    }
  }, [deleteState.isExecuting])

  const confirmDelete = useCallback(async () => {
    if (
      mode !== "single" ||
      loadInProgress.current ||
      !deleteState.ref ||
      !collectionRef.current ||
      !isCurrentResourceRef(deleteState.ref)
    )
      return
    const current = generation.current
    const ref = deleteState.ref
    const boundary = activeResourceBoundaryRef.current!
    const mutationIdentity = boundaryIdentity(boundary)
    const existingMutation = mutationsByBoundary.current.get(mutationIdentity)
    if (existingMutation) return existingMutation.promise
    const account = accountsRef.current.find(
      (candidate) => candidate.id === boundary.accountId,
    )
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      ),
    )
    const controller = new AbortController()
    actionAbort.current = controller
    setDeleteState((state) => ({ ...state, isExecuting: true, failure: null }))
    const run = collectionRef.current
      .delete(ref, { signal: controller.signal })
      .then(async () => {
        if (current !== generation.current) {
          requireFreshRead(boundary)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
              ...(account
                ? { siteType: account.siteType as ProductAnalyticsSiteType }
                : {}),
              selectedCount: 1,
            },
          })
          return
        }
        setDeleteState({
          isOpen: false,
          isExecuting: false,
          ref: null,
          failure: null,
        })
        const accepted = await refresh()
        if (!accepted) requireFreshRead(boundary)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(account
              ? { siteType: account.siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount: 1,
          },
        })
      })
      .catch(async (error: unknown) => {
        const failure = toFailure(error)
        if (current !== generation.current) {
          if (
            failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          )
            requireFreshRead(boundary)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
              ...(account
                ? { siteType: account.siteType as ProductAnalyticsSiteType }
                : {}),
              selectedCount: 1,
            },
          })
          return
        }
        setDeleteState((state) => ({ ...state, isExecuting: false, failure }))
        if (
          failure.code ===
          ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
        ) {
          requireFreshRead(boundary)
          await refresh()
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(account
              ? { siteType: account.siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount: 1,
          },
        })
      })
      .finally(() => {
        if (mutationsByBoundary.current.get(mutationIdentity)?.promise === run)
          mutationsByBoundary.current.delete(mutationIdentity)
        if (actionAbort.current === controller) actionAbort.current = null
      })
    mutationsByBoundary.current.set(mutationIdentity, {
      controller,
      promise: run,
    })
    return run
  }, [deleteState.ref, isCurrentResourceRef, mode, refresh, requireFreshRead])

  const recordCreatedSecretActionResult = useCallback(
    (
      actionId:
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      result: "success" | "failure",
    ) => {
      const siteType =
        createdSecret?.correlation.kind === "account-key-resource"
          ? createdSecret.correlation.ref.siteType
          : undefined
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          actionId,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      tracker.complete(
        result === "success"
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          ...(result === "success"
            ? {}
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }),
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(siteType
              ? { siteType: siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount: 1,
          },
        },
      )
    },
    [createdSecret],
  )

  return {
    mode,
    scopes,
    selectedScope,
    rows,
    allRows: acceptedRows,
    failures,
    progress,
    isLoading,
    notice,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    detail,
    editor,
    editorOpening,
    createdSecret,
    deleteState,
    freshReadRequired,
    refresh,
    openDetail,
    closeDetail,
    selectScope,
    openCreate: () => openEditor("create"),
    openEdit: (ref: AccountKeyResourceRef) => openEditor("edit", ref),
    closeEditor,
    retryEditorOpening,
    cancelEditorOpening,
    setEditorValues,
    loadEditorOptions,
    submitEditor,
    closeCreatedSecret: () => setCreatedSecret(null),
    recordCreatedSecretCopyResult: (result: "success" | "failure") =>
      recordCreatedSecretActionResult(
        PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
        result,
      ),
    recordCreatedSecretSaveResult: (result: "success" | "failure") =>
      recordCreatedSecretActionResult(
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        result,
      ),
    openDelete,
    cancelDelete,
    confirmDelete,
  }
}
