import React from "react"
import { Toaster } from "react-hot-toast"

import "~/utils/i18n.ts"
import "~/styles/style.css"

export const ContentReactRoot: React.FC = () => {
  return <Toaster position="top-right" gutter={8} />
}
