import { useState } from "react"
import { useTranslation } from "react-i18next"

import { buildReadOnlyOpenRouterKeyResourceCardPresentation } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"

import { QuickKeyResourceCard } from "./QuickKeyResourceCard"

/** Renders a provider-native key as read-only inventory in the quick list. */
export function OpenRouterKeyResourceItem({
  row,
}: {
  row: NativeKeyManagementRow
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const [isExpanded, setIsExpanded] = useState(false)
  const presentation = buildReadOnlyOpenRouterKeyResourceCardPresentation(
    row,
    t,
  )

  return (
    <QuickKeyResourceCard
      presentation={presentation}
      secret={presentation.maskedLabel}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    />
  )
}
