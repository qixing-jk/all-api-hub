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
  iconClass = "text-gray-900 dark:text-gray-100",
}: LinkCardProps) => {
  return (
    <Card padding="md">
      <div className="flex h-full space-x-4">
        <Icon className={`mt-1 h-6 w-6 shrink-0 ${iconClass}`} />
        <div className="flex flex-1 flex-col">
          <div className="mb-3">
            <Heading5 weight="medium" className="mb-2">
              {title}
            </Heading5>
            <BodySmall>{description}</BodySmall>
          </div>
          <div className="mt-auto">
            <Button variant={buttonVariant} size="sm">
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
