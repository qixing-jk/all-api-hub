import { Card } from "~/components/ui"

/**
 * Skeleton placeholder while Basic Settings content loads.
 */
export default function LoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse">
        <div className="bg-secondary mb-4 h-4 w-1/4 rounded"></div>
        <div className="space-y-3">
          <Card padding="default">
            <div className="bg-secondary h-16 rounded"></div>
          </Card>
          <Card padding="default">
            <div className="bg-secondary h-16 rounded"></div>
          </Card>
          <Card padding="default">
            <div className="bg-secondary h-16 rounded"></div>
          </Card>
        </div>
      </div>
    </div>
  )
}
