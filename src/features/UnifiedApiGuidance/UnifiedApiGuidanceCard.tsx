import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import {
  GuidanceCardActionButton,
  GuidanceCardLayout,
  GuidanceCardNote,
} from "./components/GuidanceCardLayout"
import { UnifiedApiGuidanceStepper } from "./components/UnifiedApiGuidanceStepper"
import {
  getUnifiedApiGuidanceCopy,
  getUnifiedApiGuidanceStepperCopy,
  UNIFIED_API_GUIDANCE_SURFACES,
  type UnifiedApiGuidanceCopy,
  type UnifiedApiGuidanceSurface,
} from "./i18n"
import {
  UNIFIED_API_GUIDANCE_STATUSES,
  type UnifiedApiGuidanceAction,
  type UnifiedApiGuidanceModel,
} from "./model"
import { UNIFIED_API_GUIDANCE_TEST_IDS } from "./testIds"

interface UnifiedApiGuidanceCardProps {
  model: UnifiedApiGuidanceModel
  surface: UnifiedApiGuidanceSurface
  onAction: (action: UnifiedApiGuidanceAction) => void
  onDismissForSession?: () => void
  onRequestPermanentDismiss?: () => void
}

interface UnifiedApiGuidanceUnavailableCardProps {
  isRetrying: boolean
  onRetry: () => void
}

const statusBadgeVariants = {
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsSources]: "warning",
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource]: "warning",
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite]: "info",
  [UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport]: "success",
  [UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels]: "success",
} as const

/**
 * Renders the state-aware unified API setup guidance card.
 */
export function UnifiedApiGuidanceCard({
  model,
  surface,
  onAction,
  onDismissForSession,
  onRequestPermanentDismiss,
}: UnifiedApiGuidanceCardProps) {
  const { t } = useTranslation([
    UNIFIED_API_GUIDANCE_SURFACES.Account,
    UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview,
  ])
  const copy = getUnifiedApiGuidanceCopy(t, surface)
  const isOptionsOverview =
    surface === UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview
  const dismissControls =
    surface === UNIFIED_API_GUIDANCE_SURFACES.Account &&
    onDismissForSession &&
    onRequestPermanentDismiss
      ? {
          dismissForSessionLabel: t(
            "account:unifiedApiGuidance.dismissForSession",
          ),
          permanentlyDismissLabel: t(
            "account:unifiedApiGuidance.permanentlyDismiss",
          ),
          onDismissForSession,
          onRequestPermanentDismiss,
        }
      : undefined

  return (
    <GuidanceCardLayout
      badge={copy.sourceSummary(model.sourceKind)}
      badgeVariant={statusBadgeVariants[model.status]}
      title={copy.headline()}
      description={copy.description(model)}
      notes={
        isOptionsOverview ? (
          <OverviewGuidanceContent copy={copy} model={model} t={t} />
        ) : (
          <GuidanceNotes copy={copy} model={model} />
        )
      }
      dismissControls={dismissControls}
      actions={
        <>
          <div className="grid gap-2">
            <GuidanceActionButton
              action={model.primaryAction}
              copy={copy}
              onAction={onAction}
              primary
            />
            {model.secondaryActions.map((action) => (
              <GuidanceActionButton
                key={action.kind}
                action={action}
                copy={copy}
                onAction={onAction}
              />
            ))}
          </div>
          {model.optionalActions.length > 0 ? (
            <div className="border-t border-slate-200/70 pt-3 dark:border-white/10">
              <div className="dark:text-dark-text-tertiary mb-2 text-xs font-medium text-slate-500 uppercase">
                {copy.optionalLabel()}
              </div>
              <div className="grid gap-2">
                {model.optionalActions.map((action) => (
                  <GuidanceActionButton
                    key={action.kind}
                    action={action}
                    copy={copy}
                    onAction={onAction}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      }
    />
  )
}

/**
 * Keeps the Overview guidance slot honest when its critical local data is unavailable.
 */
export function UnifiedApiGuidanceUnavailableCard({
  isRetrying,
  onRetry,
}: UnifiedApiGuidanceUnavailableCardProps) {
  const { t } = useTranslation(UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview)

  return (
    <GuidanceCardLayout
      badge={t("unifiedApiGuidance.unavailable.badge")}
      badgeVariant="info"
      title={t("unifiedApiGuidance.unavailable.title")}
      description={t("unifiedApiGuidance.unavailable.description")}
      notes={null}
      actionPanelJustify="start"
      actions={
        <GuidanceCardActionButton primary onClick={onRetry} busy={isRetrying}>
          {t("unifiedApiGuidance.unavailable.retry")}
        </GuidanceCardActionButton>
      }
    />
  )
}

/**
 * Renders the compact Overview progress and boundary notes.
 */
function OverviewGuidanceContent({
  copy,
  model,
  t,
}: {
  copy: UnifiedApiGuidanceCopy
  model: UnifiedApiGuidanceModel
  t: TFunction
}) {
  return (
    <div className="space-y-2.5">
      <UnifiedApiGuidanceStepper
        copy={getUnifiedApiGuidanceStepperCopy(t)}
        steps={model.steps}
      />
      <div className="space-y-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <p>{copy.boundaryNote()}</p>
        <p>{copy.directToolExportNote()}</p>
        {model.modelSyncSupported && model.optionalActions.length > 0 ? (
          <p>{copy.modelSyncOptionalNote()}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Renders the persistent setup caveats and optional maintenance note.
 */
function GuidanceNotes({
  copy,
  model,
}: {
  copy: UnifiedApiGuidanceCopy
  model: UnifiedApiGuidanceModel
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <GuidanceCardNote icon="managedSite">
        {copy.boundaryNote()}
      </GuidanceCardNote>
      <GuidanceCardNote icon="key">
        {copy.directToolExportNote()}
      </GuidanceCardNote>
      {model.modelSyncSupported && model.optionalActions.length > 0 ? (
        <div className="md:col-span-2">
          <GuidanceCardNote icon="managedSite">
            {copy.modelSyncOptionalNote()}
          </GuidanceCardNote>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Renders one guidance CTA and forwards the selected action model.
 */
function GuidanceActionButton({
  action,
  copy,
  onAction,
  primary = false,
}: {
  action: UnifiedApiGuidanceAction
  copy: UnifiedApiGuidanceCopy
  onAction: (action: UnifiedApiGuidanceAction) => void
  primary?: boolean
}) {
  return (
    <GuidanceCardActionButton
      primary={primary}
      testId={primary ? UNIFIED_API_GUIDANCE_TEST_IDS.primaryAction : undefined}
      onClick={() => onAction(action)}
    >
      {copy.actionLabel(action.kind)}
    </GuidanceCardActionButton>
  )
}
