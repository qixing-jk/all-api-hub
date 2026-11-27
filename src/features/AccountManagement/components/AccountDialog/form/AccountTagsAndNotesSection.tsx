import { useTranslation } from "react-i18next"

import { FormField, Textarea } from "~/components/ui"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { Tag } from "~/types"

import { AccountFormSection } from "./AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
} from "./accountFormSections"

/** Account labels and freeform notes. */
export function AccountTagsAndNotesSection({
  continuous,
  tags,
  tagCountsById,
  tagIds,
  onSelectedTagIdsChange,
  createTag,
  renameTag,
  deleteTag,
  notes,
  onNotesChange,
}: {
  continuous?: boolean
  tags: Tag[]
  tagCountsById?: Record<string, number>
  tagIds: string[]
  onSelectedTagIdsChange: (value: string[]) => void
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  notes: string
  onNotesChange: (value: string) => void
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  return (
    <AccountFormSection
      continuous={continuous}
      id={ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.TAGS_NOTES]}
      contentClassName={continuous ? "grid gap-4 sm:grid-cols-2" : undefined}
      title={t("sections.tagsAndNotes.title")}
      description={t("sections.tagsAndNotes.description")}
      defaultOpen={
        ACCOUNT_FORM_MOBILE_DEFAULT_OPEN[ACCOUNT_FORM_SECTIONS.TAGS_NOTES]
      }
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionTagsNotes}
    >
      <FormField label={t("form.tags")} description={t("form.tagsDescription")}>
        <TagPicker
          tags={tags}
          tagCountsById={tagCountsById}
          selectedTagIds={tagIds}
          onSelectedTagIdsChange={onSelectedTagIdsChange}
          onCreateTag={createTag}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          placeholder={t("form.tagsPlaceholder")}
        />
      </FormField>

      <FormField label={t("form.notes")}>
        <div className="relative">
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t("form.notesPlaceholder")}
            rows={2}
          />
        </div>
      </FormField>
    </AccountFormSection>
  )
}
