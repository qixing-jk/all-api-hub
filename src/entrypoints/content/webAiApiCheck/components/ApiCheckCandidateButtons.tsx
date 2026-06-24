import type { TFunction } from "i18next"

import { cn } from "~/lib/utils"
import type { ApiCheckCandidate } from "~/services/verification/webAiApiCheck/extractCredentials"

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
    <div className="mt-1 flex flex-wrap gap-1">
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
              "max-w-full truncate rounded-md border px-2 py-1 text-xs sm:max-w-64",
              currentValue === candidate.value
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
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
