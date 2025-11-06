import { Card } from "~/components/ui"

export default function LoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-6 animate-pulse">
        <div className="mb-2 h-8 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
      </div>

      <Card className="mb-6">
        <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="mb-2 h-4 w-24 rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700"></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6 animate-pulse">
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      </div>

      <Card padding="none">
        <div className="animate-pulse space-y-4 p-6">
          <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      </Card>
    </div>
  )
}
