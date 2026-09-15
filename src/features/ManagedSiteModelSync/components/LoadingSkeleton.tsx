/**
 * Placeholder skeleton while New API Model Sync data loads.
 * @returns Animated skeleton blocks matching page layout.
 */
export default function LoadingSkeleton() {
  return (
    <div className="py-density-6 px-6">
      <div className="mb-density-6 space-y-density-4 animate-pulse">
        <div className="bg-secondary h-8 w-1/3 rounded"></div>
        <div className="bg-secondary h-24 rounded"></div>
        <div className="bg-secondary h-64 rounded"></div>
      </div>
    </div>
  )
}
