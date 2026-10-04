import type { ReactNode } from "react"

import { BodySmall, Button, Card, Heading5 } from "~/components/ui"

export interface LinkCardProps {
  Icon: any
  title: string
  description: string
  href: string
  buttonText: string
  buttonVariant?:
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "success"
    | "warning"
  iconClass?: string
  badge?: ReactNode
}

const LinkCard = ({
  Icon,
  title,
  description,
  href,
  buttonText,
  buttonVariant = "default",
  iconClass = "text-foreground",
  badge,
}: LinkCardProps) => {
  return (
    <Card padding="md">
      <div className="flex h-full space-x-4">
        <Icon className={`mt-density-1 h-6 w-6 shrink-0 ${iconClass}`} />
        <div className="flex flex-1 flex-col">
          <div className="mb-density-3">
            <div className="mb-density-2 flex items-center gap-2">
              <Heading5 weight="medium">{title}</Heading5>
              {badge}
            </div>
            <BodySmall>{description}</BodySmall>
          </div>
          <div className="mt-auto">
            <Button asChild variant={buttonVariant} size="sm">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {buttonText}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default LinkCard
