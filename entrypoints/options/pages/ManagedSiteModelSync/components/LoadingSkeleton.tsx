/**
 * Placeholder skeleton while New API Model Sync data loads.
 * @returns Animated skeleton blocks matching page layout.
 */
export default function LoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-6 animate-pulse space-y-4">
        <div className="h-8 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div className="h-24 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div className="h-64 rounded bg-gray-200 dark:bg-gray-700"></div>
      </div>
    </div>
  )
}
