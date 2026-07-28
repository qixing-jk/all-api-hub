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
  mapManagedResourceMigrationExecutionResult,
  mapManagedResourceMigrationPreview,
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

const createPreviewState = ({
  sourceLabel,
  targetLabel,
  totalCount,
  isLoading = false,
  error = null,
}: {
  sourceLabel: string
  targetLabel?: string
  totalCount: number
  isLoading?: boolean
  error?: string | null
}): ManagedSiteMigrationPreviewState => ({
  sourceLabel,
  targetLabel,
  rows: [],
  generalWarnings: [],
  readyCount: 0,
  blockedCount: 0,
  totalCount,
  isLoading,
  isManualLoading: false,
  error,
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
  const [preview, setPreview] =
    useState<ManagedSiteMigrationPreviewState | null>(null)
  const [result, setResult] = useState<ManagedSiteMigrationResult | null>(null)
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
  const targetPresentationSignature = JSON.stringify(
    targets
      .map(({ value, label }) => [value, label] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  const selectedRowKeysRef = useRef(selectedRowKeys)
  const targetsRef = useRef(targets)
  const analyticsRef = useRef(analytics)
  const analyticsSurfaceIdRef = useRef(analyticsSurfaceId)
  const executeMigrationRef = useRef(executeMigration)
  const getSiteLabelRef = useRef(getSiteLabel)
  const onCloseRef = useRef(onClose)
  const prepareMigrationRef = useRef(prepareMigration)
  const refreshRef = useRef(refresh)
  const resolveDisplayNameRef = useRef(resolveDisplayName)
  const resolveRefRef = useRef(resolveRef)
  const tRef = useRef(t)
  selectedRowKeysRef.current = selectedRowKeys
  targetsRef.current = targets
  analyticsRef.current = analytics
  analyticsSurfaceIdRef.current = analyticsSurfaceId
  executeMigrationRef.current = executeMigration
  getSiteLabelRef.current = getSiteLabel
  onCloseRef.current = onClose
  prepareMigrationRef.current = prepareMigration
  refreshRef.current = refresh
  resolveDisplayNameRef.current = resolveDisplayName
  resolveRefRef.current = resolveRef
  tRef.current = t

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
    const targetLabel = targetsRef.current.find(
      ({ value }) => value === selectedTarget,
    )?.label
    setPreview((currentPreview) =>
      currentPreview && currentPreview.targetLabel !== targetLabel
        ? { ...currentPreview, targetLabel }
        : currentPreview,
    )
  }, [selectedTarget, targetPresentationSignature])

  useEffect(() => {
    if (!isOpen) {
      invalidate(true)
      setPreview(null)
      setResult(null)
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
    setResult(null)
    setIsConfirmationOpen(false)
    const currentTargets = targetsRef.current
    const currentSelectedRowKeys = selectedRowKeysRef.current
    const sourceLabel = getSiteLabelRef.current(sourceSiteType)
    const targetOption = currentTargets.find(
      ({ value }) => value === selectedTarget,
    )
    const totalCount = currentSelectedRowKeys.length
    startAnalytics()
    setPreview(
      createPreviewState({
        sourceLabel,
        targetLabel: targetOption?.label,
        totalCount,
        isLoading: true,
      }),
    )
    if (manualPreviewRefresh.current) {
      setPreview((currentPreview) =>
        currentPreview
          ? { ...currentPreview, isManualLoading: true }
          : currentPreview,
      )
      manualPreviewRefresh.current = false
    }

    const failValidation = () => {
      if (current !== generation.current) return
      setPreview(
        createPreviewState({
          sourceLabel,
          targetLabel: targetOption?.label,
          totalCount,
          error: tRef.current(
            "managedSiteChannels:migration.preview.loadFailed",
            { error: tRef.current("common:labels.unknown") },
          ),
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
        const mapped = mapManagedResourceMigrationPreview(canonical, {
          t: tRef.current,
          getSiteLabel: getSiteLabelRef.current,
        })
        const latestTargetLabel = targetsRef.current.find(
          ({ value }) => value === canonical.targetSiteType,
        )?.label
        setPreview({
          ...mapped,
          targetLabel: latestTargetLabel ?? mapped.targetLabel,
        })
      })
      .catch(() => {
        if (current !== generation.current || controller.signal.aborted) return
        canonicalPreview.current = null
        setPreview(
          createPreviewState({
            sourceLabel,
            targetLabel: targetOption.label,
            totalCount,
            error: tRef.current(
              "managedSiteChannels:migration.preview.loadFailed",
              { error: tRef.current("common:labels.unknown") },
            ),
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
    if (!executionPreview || isRunning || result) return

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

      const presentationResult = mapManagedResourceMigrationExecutionResult(
        canonicalResult,
        { t: tRef.current },
      )
      setResult(
        refreshAccepted
          ? presentationResult
          : { ...presentationResult, refreshRequired: true },
      )
      const sourceManagedSiteType = resolveProductAnalyticsManagedSiteType(
        executionPreview.sourceSiteType,
      )
      const targetManagedSiteType = resolveProductAnalyticsManagedSiteType(
        executionPreview.targetSiteType,
      )
      const insights = {
        itemCount: canonicalResult.totalSelected,
        selectedCount: canonicalResult.totalSelected,
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
      setPreview((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              error: tRef.current(
                "managedSiteChannels:migration.preview.loadFailed",
                {
                  error: tRef.current("common:labels.unknown"),
                },
              ),
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
  }, [completeAnalytics, isRunning, result])

  const callbacks = useMemo<ManagedSiteMigrationCallbacks>(
    () => ({
      onTargetChange(targetValue) {
        if (
          !isRunning &&
          !result &&
          targetValue !== selectedTarget &&
          targetsRef.current.some(({ value }) => value === targetValue)
        ) {
          previewAbort.current?.abort()
          setSelectedTarget(targetValue as ManagedSiteType)
        }
      },
      onRefreshPreview() {
        if (isRunning || result || !selectedTarget) return
        previewAbort.current?.abort()
        manualPreviewRefresh.current = true
        setPreviewRefreshKey((current) => current + 1)
      },
      async onRecoverRefreshRequired() {
        if (
          isRunning ||
          isRecoveryRunning ||
          activeRecovery.current ||
          result?.refreshRequired !== true
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
            setResult((currentResult) =>
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
        if (isRunning || isRecoveryRunning || result?.refreshRequired) return
        invalidate(true)
        setPreview(null)
        setResult(null)
        setIsConfirmationOpen(false)
        onCloseRef.current()
      },
      onOpenConfirmation() {
        if (
          !isRunning &&
          !result &&
          canonicalPreview.current &&
          preview?.readyCount
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
      preview?.readyCount,
      result,
      selectedTarget,
    ],
  )

  return {
    selectedTarget,
    targets: [...targets],
    preview,
    result,
    isConfirmationOpen,
    isRunning,
    isRecoveryRunning,
    refreshRequired: result?.refreshRequired === true,
    callbacks,
  }
}
