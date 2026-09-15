import type { TFunction } from "i18next"

import { cn } from "~/lib/utils"
import type { ApiCheckCandidate } from "~/services/verification/webAiApiCheck/credentialExtraction/candidateContract"

import { WEB_AI_API_CHECK_TEST_IDS } from "../testIds"

type ApiCheckCandidateButtonsProps = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  kind: "baseUrl" | "apiKey"
  candidates: ApiCheckCandidate[]
  currentValue: string
  onSelect: (value: string) => void
}

/**
 * Shows extracted credential candidates as compact selectable chips.
 */
export function ApiCheckCandidateButtons({
  t,
  kind,
  candidates,
  currentValue,
  onSelect,
}: ApiCheckCandidateButtonsProps) {
  if (candidates.length <= 1) return null

  return (
    <div className="mt-density-1 gap-y-density-1 flex flex-wrap gap-x-1">
      {candidates.slice(0, 4).map((candidate, index) => {
        const label =
          kind === "apiKey"
            ? (() => {
                const apiKeyCandidateLabel = t(
                  "webAiApiCheck:modal.candidates.apiKey",
                  {
                    index: index + 1,
                  },
                )
                return apiKeyCandidateLabel ===
                  "webAiApiCheck:modal.candidates.apiKey"
                  ? `${apiKeyCandidateLabel} ${index + 1}`
                  : apiKeyCandidateLabel
              })()
            : candidate.value

        return (
          <button
            key={`${kind}-${candidate.value}`}
            type="button"
            data-testid={`${
              kind === "apiKey"
                ? WEB_AI_API_CHECK_TEST_IDS.apiKeyCandidatePrefix
                : WEB_AI_API_CHECK_TEST_IDS.baseUrlCandidatePrefix
            }-${index}`}
            className={cn(
              "py-density-1 min-h-(--density-control-xs) max-w-full truncate rounded-md border px-2 text-xs sm:max-w-64",
              currentValue === candidate.value
                ? "border-theme-500 bg-theme-50 text-theme-700 dark:bg-theme-950/40 dark:text-theme-200"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            title={kind === "baseUrl" ? candidate.value : undefined}
            onClick={() => onSelect(candidate.value)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
