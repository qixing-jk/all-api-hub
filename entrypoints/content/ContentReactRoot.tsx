import React from "react"
import { Toaster } from "react-hot-toast"

import "~/utils/i18n"
import "~/styles/style.css"

export const ContentReactRoot: React.FC = () => {
  return <Toaster position="bottom-center" gutter={8} />
}
