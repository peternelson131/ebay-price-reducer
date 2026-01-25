import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'

export default function ReplyInput({ conversation, onSendMessage, sending }) {
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!message.trim() || sending) return

    try {
      await onSendMessage(message.trim())
      setMessage('') // Clear input after successful send
    } catch (error) {
      console.error('Failed to send message:', error)
      // Error handling is done in parent component
    }
  }

  const handleKeyDown = (e) => {
    // Send on Enter, new line on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  if (!conversation) {
    return null
  }

  return (
    <div className="border-t border-theme bg-theme-surface p-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        {/* Message Input */}
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${conversation.name || 'user'}...`}
            disabled={sending}
            rows={1}
            className="w-full px-4 py-3 bg-theme-primary border border-theme rounded-lg text-sm text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{
              minHeight: '44px',
              maxHeight: '120px',
              height: 'auto',
              overflow: 'auto'
            }}
            onInput={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
          />
          <p className="mt-1 text-xs text-theme-tertiary">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!message.trim() || sending}
          className="flex-shrink-0 bg-accent hover:bg-accent-hover text-white p-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-theme-surface"
          title="Send message"
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>

      {/* Instagram 24hr limit warning */}
      {conversation.platform?.toLowerCase() === 'instagram' && (
        <div className="mt-3 text-xs text-theme-tertiary bg-theme-hover p-2 rounded-lg">
          <span className="font-medium">Note:</span> Instagram limits messaging to 24 hours after the user's last message.
        </div>
      )}
    </div>
  )
}
