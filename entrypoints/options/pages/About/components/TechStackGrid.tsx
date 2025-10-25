import { Badge, Card, CardContent } from "~/components/ui"

export interface TechItem {
  name: string
  version: string
  description: string
}

export interface TechStackGridProps {
  items: TechItem[]
}

const TechStackGrid = ({ items }: TechStackGridProps) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((tech, index) => (
        <Card key={index}>
          <CardContent>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-base font-medium text-gray-900 dark:text-dark-text-primary">
                {tech.name}
              </span>
              <Badge variant="secondary" size="sm">
                v{tech.version}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              {tech.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default TechStackGrid
