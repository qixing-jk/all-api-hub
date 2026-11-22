import { Alert, Button } from "~/components/ui"

/** Make the active sample data and its exit visible after closing the developer panel. */
export function ReportPreviewNotice({ exit }: { exit: () => void }) {
  return (
    <Alert
      className="md:items-center"
      title="Dev preview · Sample data"
      action={
        <Button size="sm" variant="outline" onClick={exit}>
          Exit preview
        </Button>
      }
    />
  )
}
