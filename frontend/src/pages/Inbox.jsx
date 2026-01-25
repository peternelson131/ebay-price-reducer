import { useState, useEffect } from 'react'
import ConversationList from '../components/inbox/ConversationList'
import MessageThread from '../components/inbox/MessageThread'
import ReplyInput from '../components/inbox/ReplyInput'
import { AlertCircle } from 'lucide-react'

export default function Inbox() {
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations()
  }, [])

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  const fetchConversations = async () => {
    try {
      setLoadingConversations(true)
      setError(null)

      const response = await fetch('/api/instagram-inbox?type=conversations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`)
      }

      const data = await response.json()
      setConversations(data.conversations || [])

      // Auto-select first conversation if available
      if (data.conversations?.length > 0 && !selectedConversation) {
        setSelectedConversation(data.conversations[0])
      }
    } catch (err) {
      console.error('Error fetching conversations:', err)
      setError(err.message)
      // Use mock data for development
      setConversations(getMockConversations())
      if (!selectedConversation) {
        setSelectedConversation(getMockConversations()[0])
      }
    } finally {
      setLoadingConversations(false)
    }
  }

  const fetchMessages = async (conversationId) => {
    try {
      setLoadingMessages(true)
      setError(null)

      const response = await fetch(
        `/api/instagram-inbox?type=messages&conversationId=${conversationId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`)
      }

      const data = await response.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Error fetching messages:', err)
      setError(err.message)
      // Use mock data for development
      setMessages(getMockMessages(conversationId))
    } finally {
      setLoadingMessages(false)
    }
  }

  const handleSendMessage = async (messageText) => {
    if (!selectedConversation || !messageText.trim()) return

    try {
      setSending(true)
      setError(null)

      const response = await fetch('/api/instagram-send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: messageText
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`)
      }

      const data = await response.json()

      // Add the sent message to the messages list
      const newMessage = {
        id: data.messageId || Date.now().toString(),
        text: messageText,
        timestamp: new Date().toISOString(),
        fromMe: true
      }

      setMessages(prev => [...prev, newMessage])

      // Update conversation's last message
      setConversations(prev =>
        prev.map(conv =>
          conv.id === selectedConversation.id
            ? { ...conv, lastMessage: newMessage }
            : conv
        )
      )
    } catch (err) {
      console.error('Error sending message:', err)
      setError(err.message)
      
      // For development: still add message to UI
      const newMessage = {
        id: Date.now().toString(),
        text: messageText,
        timestamp: new Date().toISOString(),
        fromMe: true
      }
      setMessages(prev => [...prev, newMessage])
    } finally {
      setSending(false)
    }
  }

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation)
    setMessages([]) // Clear messages while loading new conversation
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex">
      {/* Error Banner */}
      {error && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
          <div className="bg-error/10 border border-error/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-error font-medium">Error</p>
              <p className="text-sm text-error/90 mt-1">{error}</p>
              <p className="text-xs text-error/70 mt-2">Using mock data for development.</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error/70 hover:text-error text-sm font-medium flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Conversation List - Left Panel */}
      <div className="w-full md:w-80 lg:w-96 flex-shrink-0">
        <ConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
          loading={loadingConversations}
        />
      </div>

      {/* Message Thread + Reply Input - Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessageThread
          conversation={selectedConversation}
          messages={messages}
          loading={loadingMessages}
        />
        <ReplyInput
          conversation={selectedConversation}
          onSendMessage={handleSendMessage}
          sending={sending}
        />
      </div>
    </div>
  )
}

// Mock data for development
function getMockConversations() {
  return [
    {
      id: '1',
      name: 'Sarah Johnson',
      avatar: null,
      platform: 'instagram',
      lastMessage: {
        text: 'Hey! I saw your post about the collaboration...',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() // 15 minutes ago
      },
      unreadCount: 2
    },
    {
      id: '2',
      name: 'Brand Partnerships',
      avatar: null,
      platform: 'instagram',
      lastMessage: {
        text: 'Thanks for reaching out! We\'d love to work with you.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() // 2 hours ago
      },
      unreadCount: 0
    },
    {
      id: '3',
      name: 'Mike Chen',
      avatar: null,
      platform: 'facebook',
      lastMessage: {
        text: 'Can you send me the details?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
      },
      unreadCount: 1
    },
    {
      id: '4',
      name: 'Emily Rodriguez',
      avatar: null,
      platform: 'instagram',
      lastMessage: {
        text: 'Perfect! Let\'s schedule a call.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() // 3 days ago
      },
      unreadCount: 0
    }
  ]
}

function getMockMessages(conversationId) {
  const messagesByConversation = {
    '1': [
      {
        id: 'm1',
        text: 'Hi! I noticed you work with brands. I have a product that might interest you.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        fromMe: false
      },
      {
        id: 'm2',
        text: 'Sure! I\'d love to hear more about it. What kind of product is it?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
        fromMe: true
      },
      {
        id: 'm3',
        text: 'It\'s a new line of eco-friendly water bottles. We\'re looking for influencers to showcase them.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
        fromMe: false
      },
      {
        id: 'm4',
        text: 'Hey! I saw your post about the collaboration...',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        fromMe: false
      }
    ],
    '2': [
      {
        id: 'm5',
        text: 'Hello! I\'m interested in partnering with your brand.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        fromMe: true
      },
      {
        id: 'm6',
        text: 'Thanks for reaching out! We\'d love to work with you.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        fromMe: false
      }
    ],
    '3': [
      {
        id: 'm7',
        text: 'Can you send me the details?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        fromMe: false
      }
    ],
    '4': [
      {
        id: 'm8',
        text: 'Perfect! Let\'s schedule a call.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        fromMe: false
      }
    ]
  }

  return messagesByConversation[conversationId] || []
}
