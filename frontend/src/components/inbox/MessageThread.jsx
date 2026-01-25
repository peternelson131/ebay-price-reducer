import { useEffect, useRef } from 'react'
import { Instagram, MessageCircle, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function MessageThread({ conversation, messages, loading }) {
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatMessageDate = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      })
    }
  }

  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'instagram':
        return <Instagram className="h-5 w-5 text-pink-500" />
      case 'facebook':
      case 'messenger':
        return <MessageCircle className="h-5 w-5 text-blue-500" />
      default:
        return <MessageCircle className="h-5 w-5 text-theme-tertiary" />
    }
  }

  // Group messages by date
  const groupMessagesByDate = (messages) => {
    const groups = []
    let currentDate = null
    let currentGroup = []

    messages?.forEach((message) => {
      const messageDate = formatMessageDate(message.timestamp)
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup })
        }
        currentDate = messageDate
        currentGroup = [message]
      } else {
        currentGroup.push(message)
      }
    })

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup })
    }

    return groups
  }

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center bg-theme-primary">
        <div className="text-center px-4">
          <MessageCircle className="h-16 w-16 text-theme-tertiary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-theme-primary mb-2">No conversation selected</h3>
          <p className="text-theme-secondary text-sm">
            Select a conversation from the list to view messages
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-theme-primary">
        {/* Header (visible while loading) */}
        <div className="p-4 border-b border-theme flex items-center justify-between bg-theme-surface">
          <div className="flex items-center gap-3">
            {conversation.avatar ? (
              <img
                src={conversation.avatar}
                alt={conversation.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <span className="text-accent font-semibold">
                  {conversation.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div>
              <h2 className="font-semibold text-theme-primary">{conversation.name || 'Unknown User'}</h2>
              <div className="flex items-center gap-1.5 text-xs text-theme-tertiary">
                {getPlatformIcon(conversation.platform)}
                <span className="capitalize">{conversation.platform || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            <p className="mt-2 text-theme-secondary text-sm">Loading messages...</p>
          </div>
        </div>
      </div>
    )
  }

  const messageGroups = groupMessagesByDate(messages)

  return (
    <div className="h-full flex flex-col bg-theme-primary">
      {/* Header */}
      <div className="p-4 border-b border-theme flex items-center justify-between bg-theme-surface">
        <div className="flex items-center gap-3">
          {conversation.avatar ? (
            <img
              src={conversation.avatar}
              alt={conversation.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
              <span className="text-accent font-semibold">
                {conversation.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
          )}
          <div>
            <h2 className="font-semibold text-theme-primary">{conversation.name || 'Unknown User'}</h2>
            <div className="flex items-center gap-1.5 text-xs text-theme-tertiary">
              {getPlatformIcon(conversation.platform)}
              <span className="capitalize">{conversation.platform || 'Unknown'}</span>
            </div>
          </div>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => navigate('/inbox-settings')}
          className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors"
          title="Inbox Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messageGroups.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-theme-secondary text-sm">No messages yet</p>
          </div>
        ) : (
          messageGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Date divider */}
              <div className="flex items-center justify-center mb-4">
                <div className="bg-theme-surface px-3 py-1 rounded-full text-xs text-theme-tertiary">
                  {group.date}
                </div>
              </div>

              {/* Messages in this date group */}
              <div className="space-y-3">
                {group.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${message.fromMe ? 'order-2' : 'order-1'}`}>
                      <div
                        className={`px-4 py-2 rounded-2xl ${
                          message.fromMe
                            ? 'bg-accent text-white rounded-tr-sm'
                            : 'bg-theme-surface text-theme-primary rounded-tl-sm'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                      </div>
                      <div className={`mt-1 text-xs text-theme-tertiary ${
                        message.fromMe ? 'text-right' : 'text-left'
                      }`}>
                        {formatMessageTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
