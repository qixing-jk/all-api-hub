import { Card } from "~/components/ui"

/**
 * Skeleton placeholder while auto-checkin dashboard data loads.
 */
export default function LoadingSkeleton() {
  return (
    <div className="py-density-6 px-6" data-options-page-pending>
      <div className="mb-density-6 animate-pulse">
        <div className="bg-secondary mb-density-2 h-8 w-1/3 rounded"></div>
        <div className="bg-secondary h-4 w-2/3 rounded"></div>
      </div>

      <Card className="mb-density-6">
        <div className="gap-y-density-4 grid animate-pulse grid-cols-1 gap-x-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="bg-secondary mb-density-2 h-4 w-24 rounded"></div>
              <div className="bg-secondary h-6 w-32 rounded"></div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-density-6 animate-pulse">
        <div className="gap-y-density-2 flex gap-x-2">
          <div className="bg-secondary h-10 w-32 rounded"></div>
          <div className="bg-secondary h-10 w-32 rounded"></div>
        </div>
      </div>

      <Card padding="none">
        <div className="space-y-density-4 py-density-6 animate-pulse px-6">
          <div className="bg-secondary h-10 w-full rounded"></div>
          <div className="bg-secondary h-10 w-full rounded"></div>
          <div className="bg-secondary h-10 w-full rounded"></div>
        </div>
      </Card>
    </div>
  )
}
