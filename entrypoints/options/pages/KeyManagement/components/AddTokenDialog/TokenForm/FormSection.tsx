import React from "react"

interface FormSectionProps {
  title: string
  children: React.ReactNode
}

/**
 * Lightweight wrapper adding spacing and a heading for grouped form fields.
 * @param props Section configuration.
 * @param props.title Section heading text.
 * @param props.children Field elements rendered inside the section.
 * @returns JSX section block with heading and content.
 */
export function FormSection({ title, children }: FormSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="dark:text-dark-text-primary text-sm font-medium text-gray-900">
        {title}
      </h3>
      {children}
    </div>
  )
}
