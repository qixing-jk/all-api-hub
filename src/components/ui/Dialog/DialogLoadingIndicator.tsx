import { Spinner } from "~/components/ui/spinner"

/** Centered loading indicator for a dialog whose content is being fetched. */
export function DialogLoadingIndicator({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-density-4 py-density-8 text-center">
      <Spinner size="lg" aria-label={label} />
      <p className="text-sm text-muted-foreground dark:text-secondary-foreground">
        {label}
      </p>
    </div>
  )
}
