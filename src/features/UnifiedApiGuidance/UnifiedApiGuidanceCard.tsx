import { ChevronUp } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, Notice } from "~/components/ui"

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
  onCollapse?: () => void
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
  onCollapse,
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
  if (isOptionsOverview) {
    return (
      <div className="space-y-5 rounded-xl border border-slate-200/80 p-4 sm:p-5 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-semibold">
              {t("optionsOverview:unifiedApiGuidance.overview.title")}
            </h3>
            <p className="text-muted-foreground max-w-3xl text-sm leading-6">
              {model.status === UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels
                ? t(
                    "optionsOverview:unifiedApiGuidance.overview.completedDescription",
                  )
                : copy.description(model)}
            </p>
          </div>
          {onCollapse ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCollapse}
              aria-expanded={true}
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
              {t("optionsOverview:unifiedApiGuidance.overview.collapse")}
            </Button>
          ) : null}
        </div>
        <UnifiedApiGuidanceStepper
          copy={getUnifiedApiGuidanceStepperCopy(t)}
          steps={model.steps}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            data-testid={UNIFIED_API_GUIDANCE_TEST_IDS.primaryAction}
            onClick={() => onAction(model.primaryAction)}
          >
            {copy.actionLabel(model.primaryAction.kind)}
          </Button>
          {model.secondaryActions.map((action) => (
            <Button
              key={action.kind}
              size="sm"
              variant="outline"
              onClick={() => onAction(action)}
            >
              {copy.actionLabel(action.kind)}
            </Button>
          ))}
        </div>
      </div>
    )
  }
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
      notes={<GuidanceNotes copy={copy} model={model} />}
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
    <Notice
      tone="info"
      title={t("unifiedApiGuidance.unavailable.title")}
      description={t("unifiedApiGuidance.unavailable.description")}
      actions={
        <Button
          size="sm"
          variant="outline"
          aria-busy={isRetrying || undefined}
          aria-disabled={isRetrying || undefined}
          onClick={() => {
            if (!isRetrying) onRetry()
          }}
        >
          {t("unifiedApiGuidance.unavailable.retry")}
        </Button>
      }
    />
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
    <div className="grid gap-2">
      <GuidanceCardNote icon="managedSite">
        {copy.boundaryNote()}
      </GuidanceCardNote>
      {model.modelSyncSupported && model.optionalActions.length > 0 ? (
        <GuidanceCardNote icon="managedSite">
          {copy.modelSyncOptionalNote()}
        </GuidanceCardNote>
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
