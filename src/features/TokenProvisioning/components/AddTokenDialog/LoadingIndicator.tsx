/**
 * Skeleton placeholder shown while token dialog data loads.
 * @returns Animated pulse blocks mimicking the form layout.
 */
export function LoadingIndicator() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse">
        <div className="bg-secondary mb-4 h-4 w-1/4 rounded"></div>
        <div className="space-y-3">
          <div className="bg-secondary h-10 rounded"></div>
          <div className="bg-secondary h-10 rounded"></div>
          <div className="bg-secondary h-10 rounded"></div>
        </div>
      </div>
    </div>
  )
}
