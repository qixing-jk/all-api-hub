export interface FeatureListProps {
  title: string
  items: string[]
  color: "green" | "blue"
}

const FeatureList = ({ title, items, color }: FeatureListProps) => {
  if (items.length === 0) {
    return null
  }

  const palette =
    color === "green"
      ? {
          dot: "bg-green-500",
          box: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/30",
          text: "text-green-800 dark:text-green-300",
          bullet: "bg-green-500"
        }
      : {
          dot: "bg-blue-500",
          box: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/30",
          text: "text-blue-800 dark:text-blue-300",
          bullet: "bg-blue-500"
        }

  return (
    <div>
      <h3 className="dark:text-dark-text-primary mb-3 flex items-center text-base font-medium text-gray-800">
        <div className={`h-2 w-2 ${palette.dot} mr-2 rounded-full`}></div>
        {title}
      </h3>
      <div className={`rounded-lg border p-4 ${palette.box}`}>
        <ul className="space-y-2">
          {items.map((feature, index) => (
            <li
              key={index}
              className={`flex items-start space-x-2 text-sm ${palette.text}`}>
              <div
                className={`h-1.5 w-1.5 ${palette.bullet} mt-2 shrink-0 rounded-full`}></div>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default FeatureList
