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
}

const LinkCard = ({
  Icon,
  title,
  description,
  href,
  buttonText,
  buttonVariant = "default",
  iconClass = "text-gray-900 dark:text-gray-100"
}: LinkCardProps) => {
  return (
    <Card padding="md">
      <div className="flex items-start space-x-4">
        <Icon className={`mt-1 h-6 w-6 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1">
          <Heading5 weight="medium" className="mb-2">
            {title}
          </Heading5>
          <BodySmall className="mb-3">{description}</BodySmall>
          <Button variant={buttonVariant} size="sm">
            <a href={href} target="_blank" rel="noopener noreferrer">
              {buttonText}
            </a>
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default LinkCard
