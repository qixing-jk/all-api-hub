import { ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Textarea } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { cn } from "~/lib/utils"

/** Keep credential acquisition first until both connection fields are available. */
export function ApiCheckSourceInput({
  hasCredentials,
  sourceText,
  onSourceTextChange,
}: {
  hasCredentials: boolean
  sourceText: string
  onSourceTextChange: (value: string) => void
}) {
  const { t } = useTranslation(["webAiApiCheck", "aiApiVerification"])
  const sourceLabelId = useId()
  const [expanded, setExpanded] = useState(false)
  const open = !hasCredentials || expanded

  return (
    <Collapsible open={open} onOpenChange={setExpanded} className="space-y-2">
      <CollapsibleTrigger
        id={sourceLabelId}
        disabled={!hasCredentials}
        className="flex w-full items-center justify-between gap-2 rounded-sm py-2 text-left text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:hover:text-primary"
      >
        {t("aiApiVerification:verifyDialog.workspace.source")}
        {hasCredentials ? (
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 text-muted-foreground", open && "rotate-180")}
          />
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Textarea
          id="api-check-source-text"
          aria-labelledby={sourceLabelId}
          value={sourceText}
          onChange={(event) => onSourceTextChange(event.target.value)}
          // Extraction can complete during typing; keep the active editor open.
          onFocus={() => setExpanded(true)}
          rows={3}
          autoSize
          className="max-h-48 resize-none"
          placeholder={t("webAiApiCheck:modal.sourceText.placeholder")}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}
