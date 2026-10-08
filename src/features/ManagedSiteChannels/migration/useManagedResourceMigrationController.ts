import type { TFunction } from "i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import {
  getMigrationPreviewErrorMessage,
  mapManagedResourceMigrationExecutionResult,
  mapManagedResourceMigrationPreview,
} from "~/features/ManagedSiteChannels/migration/managedResourceMigrationPresentation"
import {
  useManagedResourceMigrationSession,
  type ManagedResourceMigrationSessionOptions,
} from "~/features/ManagedSiteChannels/migration/useManagedResourceMigrationSession"
import type {
  ManagedSiteMigrationPreviewState,
  ManagedSiteMigrationResult,
} from "~/features/ManagedSiteChannels/presentation/contracts"

type UseManagedResourceMigrationControllerOptions =
  ManagedResourceMigrationSessionOptions & {
    t: TFunction
    getSiteLabel: (siteType: ManagedSiteType) => string
  }

/** Composes localized presentation from the migration session's facts and commands. */
export function useManagedResourceMigrationController({
  t,
  getSiteLabel,
  ...options
}: UseManagedResourceMigrationControllerOptions) {
  const { sourceSiteType, targets } = options
  const {
    selectedTarget,
    previewState,
    resultState,
    isConfirmationOpen,
    isRunning,
    isRecoveryRunning,
    callbacks,
  } = useManagedResourceMigrationSession(options)

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
