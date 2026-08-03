export function useChatUserMessageIndexing({
  getSession,
  contentHasUserAttachments
}) {
  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
  }

  function resolveUserApiIndexForDisplayMessage(message) {
    if (isFiniteNumber(message?.apiIndex)) return message.apiIndex
    const apiMessages = getSession()?.apiMessages || []
    for (let index = apiMessages.length - 1; index >= 0; index -= 1) {
      if (apiMessages[index]?.role === 'user') return index
    }
    return -1
  }

  function getUserApiMessageContentByIndex(apiIndex) {
    if (!isFiniteNumber(apiIndex) || apiIndex < 0) return null
    const apiMessage = getSession()?.apiMessages?.[apiIndex]
    if (!apiMessage || apiMessage.role !== 'user') return null
    return apiMessage.content
  }

  function messageHasDisplayAttachments(
    message,
    apiIndex = resolveUserApiIndexForDisplayMessage(message)
  ) {
    if (Array.isArray(message?.attachments) && message.attachments.length) return true
    if (Array.isArray(message?.images) && message.images.length) return true
    return contentHasUserAttachments(getUserApiMessageContentByIndex(apiIndex))
  }

  function findNearestUserApiIndexBefore(apiIndex) {
    if (!isFiniteNumber(apiIndex)) return -1
    const apiMessages = getSession()?.apiMessages || []
    for (let index = apiIndex - 1; index >= 0; index -= 1) {
      const message = apiMessages[index]
      if (message?.role === 'user' && message?.synthetic_tool_vision !== true) return index
    }
    return -1
  }

  function findDisplayIndexByApiIndex(role, apiIndex) {
    return (getSession()?.messages || []).findIndex(
      (message) => message?.role === role && message?.apiIndex === apiIndex
    )
  }

  function truncateConversationAfterUser(userApiIndex, userDisplayIndex) {
    const session = getSession()
    if (!session) return
    if (isFiniteNumber(userDisplayIndex) && userDisplayIndex >= 0) {
      session.messages.splice(userDisplayIndex + 1, session.messages.length)
    }
    if (isFiniteNumber(userApiIndex) && userApiIndex >= 0) {
      session.apiMessages.splice(userApiIndex + 1, session.apiMessages.length)
    }
  }

  return {
    isFiniteNumber,
    resolveUserApiIndexForDisplayMessage,
    getUserApiMessageContentByIndex,
    messageHasDisplayAttachments,
    findNearestUserApiIndexBefore,
    findDisplayIndexByApiIndex,
    truncateConversationAfterUser
  }
}
