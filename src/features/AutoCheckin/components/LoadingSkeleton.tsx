import { Card } from "~/components/ui"

/**
 * Skeleton placeholder while auto-checkin dashboard data loads.
 */
export default function LoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-6 animate-pulse">
        <div className="bg-secondary mb-2 h-8 w-1/3 rounded"></div>
        <div className="bg-secondary h-4 w-2/3 rounded"></div>
      </div>

      <Card className="mb-6">
        <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="bg-secondary mb-2 h-4 w-24 rounded"></div>
              <div className="bg-secondary h-6 w-32 rounded"></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6 animate-pulse">
        <div className="flex gap-2">
          <div className="bg-secondary h-10 w-32 rounded"></div>
          <div className="bg-secondary h-10 w-32 rounded"></div>
        </div>
      </div>

      <Card padding="none">
        <div className="animate-pulse space-y-4 p-6">
          <div className="bg-secondary h-10 w-full rounded"></div>
          <div className="bg-secondary h-10 w-full rounded"></div>
          <div className="bg-secondary h-10 w-full rounded"></div>
        </div>
      </Card>
    </div>
  )
}
