/**
 * Skeleton placeholder shown while token dialog data loads.
 * @returns Animated pulse blocks mimicking the form layout.
 */
export function LoadingIndicator() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse">
        <div className="dark:bg-dark-bg-tertiary mb-4 h-4 w-1/4 rounded bg-gray-200"></div>
        <div className="space-y-3">
          <div className="dark:bg-dark-bg-tertiary h-10 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary h-10 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary h-10 rounded bg-gray-200"></div>
        </div>
      </div>
    </div>
  )
}
