import toast from "react-hot-toast/headless"

import { createNotify } from "./createNotify"

/** Notifications belonging to the content script's isolated headless store. */
const notify = createNotify(toast)
export default notify
