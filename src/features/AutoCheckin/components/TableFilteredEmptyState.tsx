import { SearchX } from "lucide-react"

import { EmptyState } from "~/components/ui"

interface TableFilteredEmptyStateProps {
  title: string
  description: string
  clearLabel: string
  onClearFilters: () => void
}

/**
 * Keeps filter recovery inside a table card when no rows match.
 */
export default function TableFilteredEmptyState({
  title,
  description,
  clearLabel,
  onClearFilters,
}: TableFilteredEmptyStateProps) {
  return (
    <EmptyState
      icon={<SearchX className="h-10 w-10" />}
      title={title}
      description={description}
      action={{
        label: clearLabel,
        onClick: onClearFilters,
        variant: "outline",
      }}
      className="px-6 py-12"
    />
  )
}
