import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  executeManagedSiteMigration,
  prepareManagedSiteMigrationPreview,
} from "~/services/managedSites/channelMigration"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"
import type {
  ManagedSiteMigrationCanonicalExecutionResult,
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationSelection,
} from "~/types/managedSiteMigrationCapability"

import type {
  ManagedSiteMigrationCallbacks,
  ManagedSiteMigrationPreviewState,
  ManagedSiteMigrationResult,
} from "../presentation/contracts"
import {
  getMigrationPreviewErrorMessage,
  mapManagedResourceMigrationExecutionResult,
  mapManagedResourceMigrationPreview,
  projectManagedResourceMigrationExecutionResult,
  projectManagedResourceMigrationPreview,
  type ManagedResourceMigrationExecutionData,
  type ManagedResourceMigrationPreviewData,
} from "../presentation/managedResourceMigrationPresentation"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
  type ManagedResourceControllerAnalytics,
} from "./managedResourceControllerAnalytics"

type MigrationTarget = { value: ManagedSiteType; label: string }

type PrepareMigration = (params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  selections: readonly ManagedSiteMigrationSelection[]
  options?: { signal?: AbortSignal }
}) => Promise<ManagedSiteMigrationCanonicalPreview>

type ExecuteMigration = (params: {
  preview: ManagedSiteMigrationCanonicalPreview
  options?: { signal?: AbortSignal }
}) => Promise<ManagedSiteMigrationCanonicalExecutionResult>

type ActiveRecovery = {
  generation: number
  token: symbol
  controller: AbortController
}

type AnalyticsSession = {
  attempted: boolean
  completion?: ManagedResourceAnalyticsCompletion
}

type UseManagedResourceMigrationControllerOptions = {
  isOpen: boolean
  sourceSiteType: ManagedSiteType
  scopeIdentity: string
  selectedRowKeys: readonly string[]
  targets: readonly MigrationTarget[]
  resolveRef: (rowKey: string) => ManagedResourceRef | undefined
  resolveDisplayName: (rowKey: string) => string | undefined
  refresh: () => Promise<boolean>
  onClose: () => void
  t: TFunction
  getSiteLabel: (siteType: ManagedSiteType) => string
  analytics?: ManagedResourceControllerAnalytics
  analyticsSurfaceId?: ProductAnalyticsSurfaceId
  prepareMigration?: PrepareMigration
  executeMigration?: ExecuteMigration
}

type MigrationPreviewState = {
  data: ManagedResourceMigrationPreviewData | null
  totalCount: number
  isLoading: boolean
  isManualLoading: boolean
  failed: boolean
}

type MigrationResultState = {
  data: ManagedResourceMigrationExecutionData
  refreshRequired: boolean
}

const createPreviewState = ({
  totalCount,
  isLoading = false,
  failed = false,
}: {
  totalCount: number
  isLoading?: boolean
  failed?: boolean
}): MigrationPreviewState => ({
  data: null,
  totalCount,
  isLoading,
  isManualLoading: false,
  failed,
})

/** Owns the native migration lifecycle while keeping refs and commands out of UI state. */
export function useManagedResourceMigrationController({
  isOpen,
  sourceSiteType,
  scopeIdentity,
  selectedRowKeys,
  targets,
  resolveRef,
  resolveDisplayName,
  refresh,
  onClose,
  t,
  getSiteLabel,
  analytics,
  analyticsSurfaceId = PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
  prepareMigration = prepareManagedSiteMigrationPreview,
  executeMigration = executeManagedSiteMigration,
}: UseManagedResourceMigrationControllerOptions) {
  const [selectedTarget, setSelectedTarget] = useState<ManagedSiteType | "">(
    targets[0]?.value ?? "",
  )
  const [previewState, setPreviewState] =
    useState<MigrationPreviewState | null>(null)
  const [resultState, setResultState] = useState<MigrationResultState | null>(
    null,
  )
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isRecoveryRunning, setIsRecoveryRunning] = useState(false)
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
  const generation = useRef(0)
  const previewAbort = useRef<AbortController | undefined>(undefined)
  const executionAbort = useRef<AbortController | undefined>(undefined)
  const canonicalPreview = useRef<ManagedSiteMigrationCanonicalPreview | null>(
    null,
  )
  const analyticsSession = useRef<AnalyticsSession>({ attempted: false })
  const activeRecovery = useRef<ActiveRecovery | undefined>(undefined)
  const manualPreviewRefresh = useRef(false)
  const selectedRowKeySignature = JSON.stringify(selectedRowKeys)
  const targetSignature = JSON.stringify(
    [...new Set(targets.map(({ value }) => value))].sort(),
  )
  const selectedRowKeysRef = useRef(selectedRowKeys)
  const targetsRef = useRef(targets)
  const analyticsRef = useRef(analytics)
  const analyticsSurfaceIdRef = useRef(analyticsSurfaceId)
  const executeMigrationRef = useRef(executeMigration)
  const onCloseRef = useRef(onClose)
  const prepareMigrationRef = useRef(prepareMigration)
  const refreshRef = useRef(refresh)
  const resolveDisplayNameRef = useRef(resolveDisplayName)
  const resolveRefRef = useRef(resolveRef)
  selectedRowKeysRef.current = selectedRowKeys
  targetsRef.current = targets
  analyticsRef.current = analytics
  analyticsSurfaceIdRef.current = analyticsSurfaceId
  executeMigrationRef.current = executeMigration
  onCloseRef.current = onClose
  prepareMigrationRef.current = prepareMigration
  refreshRef.current = refresh
  resolveDisplayNameRef.current = resolveDisplayName
  resolveRefRef.current = resolveRef

  const startAnalytics = useCallback(() => {
    if (analyticsSession.current.attempted) {
      return analyticsSession.current.completion
    }
    analyticsSession.current.attempted = true
    try {
      analyticsSession.current.completion =
        startManagedResourceControllerAction(
          analyticsRef.current,
          PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
          analyticsSurfaceIdRef.current,
        )
    } catch {
      analyticsSession.current.completion = undefined
    }
    return analyticsSession.current.completion
  }, [])

  const completeAnalytics = useCallback(
    (...args: Parameters<ManagedResourceAnalyticsCompletion["complete"]>) => {
      const completion = analyticsSession.current.completion
      analyticsSession.current = { attempted: false }
      try {
        completion?.complete(...args)
      } catch {
        // Optional telemetry must never block the migration lifecycle.
      }
    },
    [],
  )

  const invalidate = useCallback(
    (completeAsCancelled: boolean) => {
      generation.current += 1
      previewAbort.current?.abort()
      previewAbort.current = undefined
      executionAbort.current?.abort()
      executionAbort.current = undefined
      activeRecovery.current?.controller.abort()
      activeRecovery.current = undefined
      canonicalPreview.current = null
      if (completeAsCancelled) {
        completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Cancelled)
      }
    },
    [completeAnalytics],
  )

  useEffect(() => {
    const currentTargets = targetsRef.current
    if (!currentTargets.some(({ value }) => value === selectedTarget)) {
      setSelectedTarget(currentTargets[0]?.value ?? "")
    }
  }, [selectedTarget, targetSignature])

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      invalidate(false)
      queueMicrotask(() => {
        if (!mounted.current) {
          completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        }
      })
    }
  }, [completeAnalytics, invalidate])

  useEffect(() => {
    if (!isOpen) {
      invalidate(true)
      setPreviewState(null)
      setResultState(null)
      setIsConfirmationOpen(false)
      setIsRunning(false)
      setIsRecoveryRunning(false)
      return
    }

    invalidate(false)
    setIsRunning(false)
    setIsRecoveryRunning(false)
    const current = generation.current
    const controller = new AbortController()
    previewAbort.current = controller
    canonicalPreview.current = null
    setResultState(null)
    setIsConfirmationOpen(false)
    const currentTargets = targetsRef.current
    const currentSelectedRowKeys = selectedRowKeysRef.current
    const targetOption = currentTargets.find(
      ({ value }) => value === selectedTarget,
    )
    const totalCount = currentSelectedRowKeys.length
    startAnalytics()
    setPreviewState(
      createPreviewState({
        totalCount,
        isLoading: true,
      }),
    )
    if (manualPreviewRefresh.current) {
      setPreviewState((currentPreview) =>
        currentPreview
          ? { ...currentPreview, isManualLoading: true }
          : currentPreview,
      )
      manualPreviewRefresh.current = false
    }

    const failValidation = () => {
      if (current !== generation.current) return
      setPreviewState(
        createPreviewState({
          totalCount,
          failed: true,
        }),
      )
      completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
        },
      })
    }

    if (!targetOption && currentTargets.length > 0) return
    if (!targetOption || currentSelectedRowKeys.length === 0) {
      failValidation()
      return
    }
    const uniqueRowKeys = new Set(currentSelectedRowKeys)
    if (uniqueRowKeys.size !== currentSelectedRowKeys.length) {
      failValidation()
      return
    }

    const selections: ManagedSiteMigrationSelection[] = []
    try {
      for (const rowKey of currentSelectedRowKeys) {
        const ref = resolveRefRef.current(rowKey)
        const displayName = resolveDisplayNameRef.current(rowKey)
        if (!ref || displayName === undefined) {
          failValidation()
          return
        }
        selections.push({ selectionId: rowKey, displayName, ref })
      }
    } catch {
      failValidation()
      return
    }

    void Promise.resolve()
      .then(() =>
        prepareMigrationRef.current({
          sourceSiteType,
          targetSiteType: targetOption.value,
          selections,
          options: { signal: controller.signal },
        }),
      )
      .then((canonical) => {
        if (current !== generation.current || controller.signal.aborted) return
        canonicalPreview.current = canonical
        setPreviewState({
          ...createPreviewState({ totalCount: canonical.totalCount }),
          data: projectManagedResourceMigrationPreview(canonical),
        })
      })
      .catch(() => {
        if (current !== generation.current || controller.signal.aborted) return
        canonicalPreview.current = null
        setPreviewState(
          createPreviewState({
            totalCount,
            failed: true,
          }),
        )
        completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Preview,
          },
        })
      })
      .finally(() => {
        if (previewAbort.current === controller)
          previewAbort.current = undefined
      })

    return () => {
      if (current === generation.current) invalidate(false)
    }
  }, [
    completeAnalytics,
    invalidate,
    isOpen,
    previewRefreshKey,
    scopeIdentity,
    selectedRowKeySignature,
    selectedTarget,
    sourceSiteType,
    startAnalytics,
    targetSignature,
  ])

  const execute = useCallback(async () => {
    const executionPreview = canonicalPreview.current
    if (!executionPreview || isRunning || resultState) return
    const selectedCount = selectedRowKeysRef.current.length

    canonicalPreview.current = null
    const current = generation.current
    const controller = new AbortController()
    executionAbort.current = controller
    setIsConfirmationOpen(false)
    setIsRunning(true)
    const warningCount =
      executionPreview.generalWarningCodes.length +
      executionPreview.items.reduce(
        (count, item) => count + item.warningCodes.length,
        0,
      )
    try {
      const canonicalResult = await executeMigrationRef.current({
        preview: executionPreview,
        options: { signal: controller.signal },
      })
      if (current !== generation.current || controller.signal.aborted) return

      let refreshAccepted = false
      try {
        refreshAccepted = await refreshRef.current()
      } catch {
        refreshAccepted = false
      }
      if (current !== generation.current || controller.signal.aborted) return

      const data =
        projectManagedResourceMigrationExecutionResult(canonicalResult)
      setResultState({
        data,
        refreshRequired:
          !refreshAccepted ||
          data.items.some((item) => item.status === "uncertain"),
      })
      const sourceManagedSiteType = resolveProductAnalyticsManagedSiteType(
        executionPreview.sourceSiteType,
      )
      const targetManagedSiteType = resolveProductAnalyticsManagedSiteType(
        executionPreview.targetSiteType,
      )
      const insights = {
        itemCount: canonicalResult.totalSelected,
        selectedCount,
        successCount: canonicalResult.createdCount,
        failureCount:
          canonicalResult.failedCount + canonicalResult.uncertainCount,
        skippedCount: canonicalResult.skippedCount,
        readyCount: executionPreview.readyCount,
        blockedCount: executionPreview.blockedCount,
        warningCount,
        ...(sourceManagedSiteType ? { sourceManagedSiteType } : {}),
        ...(targetManagedSiteType ? { targetManagedSiteType } : {}),
      }
      completeAnalytics(
        refreshAccepted
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        refreshAccepted
          ? { insights }
          : {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              insights: {
                ...insights,
                failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
              },
            },
      )
    } catch {
      if (current !== generation.current || controller.signal.aborted) return
      setPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              failed: true,
            }
          : currentPreview,
      )
      completeAnalytics(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        },
      })
    } finally {
      if (current === generation.current) {
        setIsRunning(false)
        if (executionAbort.current === controller) {
          executionAbort.current = undefined
        }
      }
    }
  }, [completeAnalytics, isRunning, resultState])

  const callbacks = useMemo<ManagedSiteMigrationCallbacks>(
    () => ({
      onTargetChange(targetValue) {
        if (
          !isRunning &&
          !resultState &&
          targetValue !== selectedTarget &&
          targetsRef.current.some(({ value }) => value === targetValue)
        ) {
          previewAbort.current?.abort()
          setSelectedTarget(targetValue as ManagedSiteType)
        }
      },
      onRefreshPreview() {
        if (isRunning || resultState || !selectedTarget) return
        previewAbort.current?.abort()
        manualPreviewRefresh.current = true
        setPreviewRefreshKey((current) => current + 1)
      },
      async onRecoverRefreshRequired() {
        if (
          isRunning ||
          isRecoveryRunning ||
          activeRecovery.current ||
          resultState?.refreshRequired !== true
        )
          return
        const recovery = {
          generation: generation.current,
          token: Symbol("managed-resource-recovery"),
          controller: new AbortController(),
        }
        activeRecovery.current = recovery
        setIsRecoveryRunning(true)
        try {
          if (
            (await refreshRef.current()) &&
            activeRecovery.current?.token === recovery.token &&
            recovery.generation === generation.current &&
            !recovery.controller.signal.aborted
          ) {
            setResultState((currentResult) =>
              currentResult
                ? { ...currentResult, refreshRequired: false }
                : currentResult,
            )
          }
        } catch {
          // Keep the controlled recovery state visible for another fresh read.
        } finally {
          if (activeRecovery.current?.token === recovery.token) {
            activeRecovery.current = undefined
            setIsRecoveryRunning(false)
          }
        }
      },
      onConfirm() {
        return execute()
      },
      onClose() {
        if (isRunning || isRecoveryRunning || resultState?.refreshRequired)
          return
        invalidate(true)
        setPreviewState(null)
        setResultState(null)
        setIsConfirmationOpen(false)
        onCloseRef.current()
      },
      onOpenConfirmation() {
        if (
          !isRunning &&
          !resultState &&
          canonicalPreview.current &&
          previewState?.data?.readyCount
        ) {
          setIsConfirmationOpen(true)
        }
      },
      onCloseConfirmation() {
        if (!isRunning) setIsConfirmationOpen(false)
      },
    }),
    [
      execute,
      invalidate,
      isRecoveryRunning,
      isRunning,
      previewState?.data?.readyCount,
      resultState,
      selectedTarget,
    ],
  )

  const mappedPreview = previewState?.data
    ? mapManagedResourceMigrationPreview(previewState.data, { t, getSiteLabel })
    : null
  const preview: ManagedSiteMigrationPreviewState | null = previewState
    ? {
        ...(mappedPreview ?? {
          sourceLabel: getSiteLabel(sourceSiteType),
          rows: [],
          generalWarnings: [],
          readyCount: 0,
          blockedCount: 0,
          totalCount: previewState.totalCount,
        }),
        targetLabel:
          targets.find(({ value }) => value === selectedTarget)?.label ??
          mappedPreview?.targetLabel,
        isLoading: previewState.isLoading,
        isManualLoading: previewState.isManualLoading,
        error: previewState.failed ? getMigrationPreviewErrorMessage(t) : null,
      }
    : null
  const result: ManagedSiteMigrationResult | null = resultState
    ? {
        ...mapManagedResourceMigrationExecutionResult(resultState.data, { t }),
        refreshRequired: resultState.refreshRequired,
      }
    : null

  return {
    selectedTarget,
    targets: [...targets],
    preview,
    result,
    isConfirmationOpen,
    isRunning,
    isRecoveryRunning,
    refreshRequired: resultState?.refreshRequired === true,
    callbacks,
  }
}
