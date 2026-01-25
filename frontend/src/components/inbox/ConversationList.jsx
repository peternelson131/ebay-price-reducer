import { useState, useEffect } from 'react'
import { Instagram, MessageCircle, Search } from 'lucide-react'

export default function ConversationList({ conversations, selectedConversation, onSelectConversation, loading }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredConversations, setFilteredConversations] = useState(conversations || [])

  useEffect(() => {
    if (!conversations) return
    
    if (searchQuery.trim() === '') {
      setFilteredConversations(conversations)
    } else {
      const query = searchQuery.toLowerCase()
      setFilteredConversations(
        conversations.filter(conv => 
          conv.name?.toLowerCase().includes(query) ||
          conv.lastMessage?.text?.toLowerCase().includes(query)
        )
      )
    }
  }, [searchQuery, conversations])

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'instagram':
        return <Instagram className="h-4 w-4 text-pink-500" />
      case 'facebook':
      case 'messenger':
        return <MessageCircle className="h-4 w-4 text-blue-500" />
      default:
        return <MessageCircle className="h-4 w-4 text-theme-tertiary" />
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-theme-surface border-r border-theme">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          <p className="mt-2 text-theme-secondary text-sm">Loading conversations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-theme-surface border-r border-theme">
      {/* Header */}
      <div className="p-4 border-b border-theme">
        <h2 className="text-lg font-semibold text-theme-primary mb-3">Messages</h2>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-theme-tertiary" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-theme-primary border border-theme rounded-lg text-sm text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-12 w-12 text-theme-tertiary mx-auto mb-3 opacity-50" />
            <p className="text-theme-secondary text-sm">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-theme">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={`w-full p-4 flex items-start gap-3 hover:bg-theme-hover transition-colors text-left ${
                  selectedConversation?.id === conversation.id ? 'bg-theme-hover' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {conversation.avatar ? (
                    <img
                      src={conversation.avatar}
                      alt={conversation.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                      <span className="text-accent font-semibold text-lg">
                        {conversation.name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  )}
                  
                  {/* Platform indicator */}
                  <div className="absolute -bottom-1 -right-1 bg-theme-surface rounded-full p-0.5">
                    {getPlatformIcon(conversation.platform)}
                  </div>
                </div>

                {/* Conversation Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-theme-primary truncate">
                      {conversation.name || 'Unknown User'}
                    </h3>
                    <span className="text-xs text-theme-tertiary ml-2 flex-shrink-0">
                      {formatTimestamp(conversation.lastMessage?.timestamp)}
                    </span>
                  </div>
                  
                  <p className={`text-sm truncate ${
                    conversation.unreadCount > 0 ? 'text-theme-primary font-medium' : 'text-theme-secondary'
                  }`}>
                    {conversation.lastMessage?.text || 'No messages yet'}
                  </p>
                </div>

                {/* Unread badge */}
                {conversation.unreadCount > 0 && (
                  <div className="flex-shrink-0 ml-2">
                    <div className="bg-accent text-white text-xs font-semibold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">
                      {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
