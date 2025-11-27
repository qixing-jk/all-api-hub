import { Card } from "~/components/ui"

export default function LoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse">
        <div className="dark:bg-dark-bg-tertiary mb-4 h-4 w-1/4 rounded bg-gray-200"></div>
        <div className="space-y-3">
          <Card padding="default">
            <div className="dark:bg-dark-bg-tertiary h-16 rounded bg-gray-200"></div>
          </Card>
          <Card padding="default">
            <div className="dark:bg-dark-bg-tertiary h-16 rounded bg-gray-200"></div>
          </Card>
          <Card padding="default">
            <div className="dark:bg-dark-bg-tertiary h-16 rounded bg-gray-200"></div>
          </Card>
        </div>
      </div>
    </div>
  )
}
