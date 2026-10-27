import { ChevronDown, RotateCcw } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, Spinner, Textarea } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { cn } from "~/lib/utils"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"
import { PELICAN_TEST_PROMPT } from "~/services/verification/modelQuality/pelican"
import {
  PELICAN_PROMPT_ID,
  type VerificationPromptId,
} from "~/services/verification/promptOverrides"

/** Edits the saved prompt beside the test that uses it. */
export function VerificationPromptEditor({
  controller,
  probeId,
}: {
  controller: VerificationToolsController
  probeId: VerificationPromptId
}) {
  const { t } = useTranslation("aiApiVerification")
  const editorId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const defaultPrompt =
    controller.getDefaultPrompt(probeId) ??
    (probeId === PELICAN_PROMPT_ID ? PELICAN_TEST_PROMPT : "")
  const value = controller.promptDraft[probeId] ?? defaultPrompt
  const isCustom = Boolean(controller.promptDraft[probeId]?.trim())
  const { setPromptDraftValue, resetPrompt, promptSaveError, isSavingPrompts } =
    controller
  if (probeId !== PELICAN_PROMPT_ID && !controller.promptIds.includes(probeId))
    return null
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="space-y-density-2"
    >
      <div
        className={cn(
          "gap-density-3 grid min-w-0",
          isOpen && "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm py-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none">
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                  !isOpen && "-rotate-90",
                )}
              />
              {t("verifyDialog.tools.prompts.editorLabel", {
                probe: getApiVerificationProbeLabel(t, probeId),
              })}
            </CollapsibleTrigger>
            {isSavingPrompts ? <Spinner size="sm" variant="gray" /> : null}
          </div>
          {isOpen ? (
            <p className="text-muted-foreground mt-density-1 text-xs leading-relaxed">
              {t("verifyDialog.tools.prompts.sharedHint")}
            </p>
          ) : null}
        </div>
        <CollapsibleContent className="min-w-0">
          <div className="gap-density-1 flex items-start">
            <div className="min-w-0 flex-1">
              <Textarea
                autoSize
                id={editorId}
                aria-label={t("verifyDialog.tools.prompts.editorLabel", {
                  probe: getApiVerificationProbeLabel(t, probeId),
                })}
                value={value}
                onChange={(event) =>
                  setPromptDraftValue(probeId, event.target.value)
                }
                placeholder={defaultPrompt}
                title={t("verifyDialog.tools.prompts.sharedHint")}
                rows={2}
                className="border-border-subtle bg-card max-h-48 min-h-16 text-xs"
              />
            </div>
            <div className="flex shrink-0 items-center">
              {isCustom ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("verifyDialog.tools.prompts.resetOne")}
                  title={t("verifyDialog.tools.prompts.resetOne")}
                  onClick={() => resetPrompt(probeId)}
                  disabled={isSavingPrompts}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </div>
      {promptSaveError ? (
        <Alert variant="warning">
          <p>
            {t("verifyDialog.tools.prompts.saveFailed", {
              message: promptSaveError,
            })}
          </p>
        </Alert>
      ) : null}
    </Collapsible>
  )
}
