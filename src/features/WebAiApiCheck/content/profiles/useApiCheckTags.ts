import { useCallback, useState } from "react"

import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import type { Tag } from "~/types"

/** Own the content-script tag catalogue while the modal owns profile selections. */
export function useApiCheckTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const loadTags = useCallback(async () => {
    setTags([])
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ListTags,
      {},
    )
    if (response?.success) {
      setTags(response.tags)
    }
  }, [])

  const createTag = useCallback(async (name: string) => {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.CreateTag,
      { name },
    )
    if (!response?.success) {
      throw new Error(response?.error || "Failed to create tag")
    }
    setTags((current) => [
      ...current.filter((tag) => tag.id !== response.tag.id),
      response.tag,
    ])
    return response.tag
  }, [])

  const renameTag = useCallback(async (tagId: string, name: string) => {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RenameTag,
      { tagId, name },
    )
    if (!response?.success) {
      throw new Error(response?.error || "Failed to rename tag")
    }
    setTags((current) =>
      current.map((tag) => (tag.id === response.tag.id ? response.tag : tag)),
    )
    return response.tag
  }, [])

  return { tags, loadTags, createTag, renameTag }
}
