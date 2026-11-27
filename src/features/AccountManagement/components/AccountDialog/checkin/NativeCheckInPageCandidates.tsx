import { CircleDashed } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, InlineMessage } from "~/components/ui"
import {
  NATIVE_CHECK_IN_PAGE_SOURCES,
  NATIVE_CHECK_IN_PAGE_STATES,
  type NativeCheckInPageCandidate,
} from "~/services/checkin/discovery/evidence/scanTypes"

/** Presents observed page facts; opening and adopting remain owned by the draft. */
export function NativeCheckInPageCandidates({
  candidates,
  candidateId,
  onOpen,
  onUse,
}: {
  candidates: NativeCheckInPageCandidate[]
  candidateId: string
  onOpen: (path: string) => void
  onUse: (path: string) => void
}) {
  const { t } = useTranslation("accountDialog")
  return (
    <ul
      className="divide-y divide-border-subtle"
      aria-label={t("form.findCheckInPageCandidates")}
    >
      {candidates.map((candidate, index) => {
        const pathId = `${candidateId}-${index}`
        const sources = candidate.sources.filter(
          (source) =>
            source !== NATIVE_CHECK_IN_PAGE_SOURCES.Area ||
            candidate.state === NATIVE_CHECK_IN_PAGE_STATES.Unverified,
        )
        return (
          <li
            key={candidate.path}
            className="space-y-density-2 border-border-subtle py-density-3 first:border-t last:border-b"
          >
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-density-1">
              <p
                id={pathId}
                className="font-mono text-sm font-medium break-all"
              >
                {candidate.path}
              </p>
              {sources.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {sources
                    .map((source) =>
                      source === NATIVE_CHECK_IN_PAGE_SOURCES.Navigation
                        ? t("form.checkInPageNavigationEvidence")
                        : source === NATIVE_CHECK_IN_PAGE_SOURCES.Script
                          ? t("form.checkInPageScriptEvidence")
                          : t("form.checkInPageAreaEvidence"),
                    )
                    .join(" · ")}
                </p>
              )}
            </div>
            <InlineMessage
              size="sm"
              role="note"
              tone={
                candidate.state === NATIVE_CHECK_IN_PAGE_STATES.Actionable
                  ? "success"
                  : "neutral"
              }
              icon={
                candidate.state ===
                NATIVE_CHECK_IN_PAGE_STATES.Actionable ? undefined : (
                  <CircleDashed className="size-3.5" />
                )
              }
            >
              {candidate.state === NATIVE_CHECK_IN_PAGE_STATES.Actionable
                ? t("form.checkInPageActionable")
                : candidate.state === NATIVE_CHECK_IN_PAGE_STATES.Area
                  ? t("form.checkInPageArea")
                  : t("form.checkInPageUnverified")}
            </InlineMessage>
            <div className="flex flex-wrap items-center justify-end gap-density-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-describedby={pathId}
                leftIcon={<WorkflowTransitionIcon className="size-3" />}
                onClick={() => onOpen(candidate.path)}
              >
                {t("form.checkInPageOpen")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-describedby={pathId}
                onClick={() => onUse(candidate.path)}
              >
                {t("form.checkInPageUse")}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
