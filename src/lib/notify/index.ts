import toast from "react-hot-toast"

import { createNotify } from "./createNotify"

export type { NotificationOptions } from "./createNotify"

/** Extension-page notifications. Content scripts use ./content instead. */
const notify = createNotify(toast)
export default notify
