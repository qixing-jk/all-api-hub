export interface FeatureListProps {
  title: string
  items: string[]
  variant: "success" | "primary"
}

const FeatureList = ({ title, items, variant }: FeatureListProps) => {
  if (items.length === 0) {
    return null
  }

  const palette =
    variant === "success"
      ? {
          dot: "bg-success-indicator",
          box: "bg-success-soft border-success-border",
          text: "text-success-soft-foreground",
          bullet: "bg-success-indicator",
        }
      : {
          dot: "bg-primary",
          box: "bg-primary-soft border-primary-soft-border",
          text: "text-primary-soft-foreground",
          bullet: "bg-primary",
        }

  return (
    <div>
      <h3 className="dark:text-foreground text-secondary-foreground mb-density-3 flex items-center text-base font-medium">
        <div className={`h-2 w-2 ${palette.dot} mr-2 rounded-full`}></div>
        {title}
      </h3>
      <div className={`py-density-4 rounded-lg border px-4 ${palette.box}`}>
        <ul className="space-y-density-2">
          {items.map((feature, index) => (
            <li
              key={index}
              className={`flex items-start space-x-2 text-sm ${palette.text}`}
            >
              <div
                className={`h-1.5 w-1.5 ${palette.bullet} mt-density-2 shrink-0 rounded-full`}
              ></div>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default FeatureList
