import { ClockIcon, TrashIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"

import { Button, IconButton } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"
import type { WebAiApiCheckBaseUrlSuggestion } from "~/services/verification/webAiApiCheck/baseUrlHistory"

type ApiCheckBaseUrlHistoryPickerProps = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  suggestions: WebAiApiCheckBaseUrlSuggestion[]
  selectedBaseUrl: string
  portalContainer: HTMLElement | null
  onSelect: (baseUrl: string) => void
  onRemove: (baseUrl: string) => void
}

/**
 * Renders the in-modal Base URL history picker for the content API check flow.
 */
export function ApiCheckBaseUrlHistoryPicker({
  t,
  isOpen,
  onOpenChange,
  suggestions,
  selectedBaseUrl,
  portalContainer,
  onSelect,
  onRemove,
}: ApiCheckBaseUrlHistoryPickerProps) {
  const hasSuggestions = suggestions.length > 0
  const triggerLabel = hasSuggestions
    ? t("webAiApiCheck:modal.history.trigger")
    : t("webAiApiCheck:modal.history.empty")

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild disabled={!hasSuggestions}>
        <IconButton
          type="button"
          aria-label={t("webAiApiCheck:modal.history.trigger")}
          title={triggerLabel}
          variant="ghost"
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          disabled={!hasSuggestions}
        >
          <ClockIcon className="h-4 w-4" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("webAiApiCheck:modal.history.label")}
        container={portalContainer ?? undefined}
        className="w-72 p-1"
      >
        <div className="text-muted-foreground px-2 py-1.5 text-xs">
          {t("webAiApiCheck:modal.history.label")}
        </div>
        <div
          aria-label={t("webAiApiCheck:modal.history.label")}
          className="max-h-52 overflow-y-auto"
          role="list"
        >
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.baseUrl}
              role="listitem"
              className="group flex min-w-0 items-center gap-1 rounded-sm"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "focus:bg-accent focus:text-accent-foreground flex min-w-0 flex-1 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
                  suggestion.baseUrl === selectedBaseUrl
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
                title={suggestion.baseUrl}
                onClick={() => onSelect(suggestion.baseUrl)}
              >
                <span className="truncate">{suggestion.baseUrl}</span>
              </Button>
              <IconButton
                type="button"
                aria-label={`${t("webAiApiCheck:modal.history.remove")}: ${
                  suggestion.baseUrl
                }`}
                title={`${t("webAiApiCheck:modal.history.remove")}: ${
                  suggestion.baseUrl
                }`}
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-destructive shrink-0 opacity-70 group-hover:opacity-100"
                onClick={() => onRemove(suggestion.baseUrl)}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
