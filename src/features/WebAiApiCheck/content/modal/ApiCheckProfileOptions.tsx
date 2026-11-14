import type { TFunction } from "i18next"
import { ChevronDown } from "lucide-react"

import { DatePicker, FormField, Input, Textarea } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import type {
  ApiCheckModalActions,
  ApiCheckModalViewModel,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { cn } from "~/lib/utils"

/** Optional metadata for saving the detected credential profile. */
export function ApiCheckProfileOptions({
  t,
  view,
  actions,
  preparing,
}: {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  view: Pick<
    ApiCheckModalViewModel,
    | "datePickerLanguage"
    | "expiresAtInput"
    | "hasProfileMetadataInput"
    | "isProfileOptionsOpen"
    | "isSavingProfile"
    | "notes"
    | "popoverPortalContainer"
    | "selectedTagIds"
    | "sourceUrl"
    | "tags"
  >
  actions: Pick<
    ApiCheckModalActions,
    | "createTag"
    | "renameTag"
    | "setExpiresAtInput"
    | "setIsProfileOptionsOpen"
    | "setNotes"
    | "setSelectedTagIds"
    | "setSourceUrl"
  >
  preparing: boolean
}) {
  return (
    <>
      <Collapsible
        open={view.isProfileOptionsOpen}
        onOpenChange={actions.setIsProfileOptionsOpen}
        className="border-t border-border pt-3"
      >
        <CollapsibleTrigger
          type="button"
          aria-label={t("webAiApiCheck:modal.optionalProfileFields.title")}
          className="flex w-full items-center justify-between gap-x-3 gap-y-density-3 rounded-sm py-density-2 text-left transition-colors hover:text-primary"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              {t("webAiApiCheck:modal.optionalProfileFields.title")}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {t(
                view.hasProfileMetadataInput
                  ? "webAiApiCheck:modal.optionalProfileFields.hasInput"
                  : "webAiApiCheck:modal.optionalProfileFields.hint",
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              view.isProfileOptionsOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="py-density-3">
          <div
            className={cn(
              "grid grid-cols-1 gap-x-3 gap-y-density-3",
              preparing && "sm:grid-cols-2 sm:items-start",
            )}
          >
            <FormField
              label={t("webAiApiCheck:modal.fields.tags")}
              description={t("webAiApiCheck:modal.hints.tags")}
            >
              <TagPicker
                tags={view.tags}
                selectedTagIds={view.selectedTagIds}
                onSelectedTagIdsChange={actions.setSelectedTagIds}
                onCreateTag={actions.createTag}
                onRenameTag={actions.renameTag}
                allowDelete={false}
                placeholder={t("webAiApiCheck:modal.placeholders.tags")}
                disabled={view.isSavingProfile}
                portalContainer={view.popoverPortalContainer}
              />
            </FormField>

            <FormField
              label={t("webAiApiCheck:modal.fields.expiresAt")}
              description={t("webAiApiCheck:modal.hints.expiresAt")}
              htmlFor="api-check-expires-at"
            >
              <DatePicker
                id="api-check-expires-at"
                value={view.expiresAtInput}
                onChange={actions.setExpiresAtInput}
                labels={{
                  trigger: t("webAiApiCheck:modal.fields.expiresAt"),
                  placeholder: t("common:datePicker.placeholder"),
                  noExpiration: t("common:datePicker.noExpiration"),
                  in7Days: t("common:datePicker.in7Days"),
                  in30Days: t("common:datePicker.in30Days"),
                  in90Days: t("common:datePicker.in90Days"),
                  in1Year: t("common:datePicker.in1Year"),
                  naturalInput: {
                    invalid: t("common:datePicker.naturalInput.invalid"),
                    label: t("common:datePicker.naturalInput.label"),
                    openCalendar: t(
                      "common:datePicker.naturalInput.openCalendar",
                    ),
                    placeholder: t(
                      "common:datePicker.naturalInput.placeholder",
                    ),
                    preview: t("common:datePicker.naturalInput.preview"),
                  },
                }}
                language={view.datePickerLanguage}
                portalContainer={view.popoverPortalContainer}
                disabled={view.isSavingProfile}
                naturalInput
              />
            </FormField>

            <FormField
              label={t("webAiApiCheck:modal.fields.notes")}
              htmlFor="api-check-notes"
            >
              <Textarea
                id="api-check-notes"
                value={view.notes}
                onChange={(e) => actions.setNotes(e.target.value)}
                rows={2}
                placeholder={t("webAiApiCheck:modal.placeholders.notes")}
                disabled={view.isSavingProfile}
              />
            </FormField>

            <FormField
              label={t("webAiApiCheck:modal.fields.sourceUrl")}
              description={t("webAiApiCheck:modal.hints.sourceUrl")}
              htmlFor="api-check-source-url"
            >
              <Input
                id="api-check-source-url"
                value={view.sourceUrl}
                onChange={(e) => actions.setSourceUrl(e.target.value)}
                placeholder={t("webAiApiCheck:modal.placeholders.sourceUrl")}
                disabled={view.isSavingProfile}
              />
            </FormField>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
