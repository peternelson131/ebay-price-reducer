import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, UserX, Search, Trash2, AlertCircle, Save, Loader2 } from 'lucide-react'

export default function InboxSettings() {
  const navigate = useNavigate()
  const [blocklist, setBlocklist] = useState([])
  const [allContacts, setAllContacts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchBlocklist()
    fetchContacts()
  }, [])

  const fetchBlocklist = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/inbox-blocklist', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch blocklist')
      }

      const data = await response.json()
      setBlocklist(data.blocklist || [])
    } catch (err) {
      console.error('Error fetching blocklist:', err)
      setError(err.message)
      // Use mock data for development
      setBlocklist(getMockBlocklist())
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/inbox-contacts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch contacts')
      }

      const data = await response.json()
      setAllContacts(data.contacts || [])
    } catch (err) {
      console.error('Error fetching contacts:', err)
      // Use mock data for development
      setAllContacts(getMockContacts())
    }
  }

  const handleAddToBlocklist = (contact) => {
    if (!blocklist.find(c => c.id === contact.id)) {
      setBlocklist([...blocklist, contact])
      setHasChanges(true)
      setSuccess(null)
    }
  }

  const handleRemoveFromBlocklist = (contactId) => {
    setBlocklist(blocklist.filter(c => c.id !== contactId))
    setHasChanges(true)
    setSuccess(null)
  }

  const handleSaveBlocklist = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/inbox-blocklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          blocklist: blocklist.map(c => c.id)
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save blocklist')
      }

      setSuccess('Blocklist saved successfully!')
      setHasChanges(false)
      
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Error saving blocklist:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredContacts = allContacts.filter(contact => {
    const matchesSearch = contact.name?.toLowerCase().includes(searchQuery.toLowerCase())
    const notBlocked = !blocklist.find(c => c.id === contact.id)
    return matchesSearch && notBlocked
  })

  return (
    <div className="min-h-screen bg-theme-primary">
      {/* Header */}
      <div className="bg-theme-surface border-b border-theme">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/inbox')}
              className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-theme-primary">Inbox Settings</h1>
              <p className="text-sm text-theme-secondary mt-0.5">Manage hidden contacts and preferences</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Error/Success Messages */}
        {error && (
          <div className="bg-error/10 border border-error/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-error font-medium">Error</p>
              <p className="text-sm text-error/90 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error/70 hover:text-error text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm text-success font-medium">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-success/70 hover:text-success text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Blocklist Section */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-theme-primary flex items-center gap-2">
                  <UserX className="h-5 w-5 text-accent" />
                  Contact Blocklist
                </h2>
                <p className="text-sm text-theme-secondary mt-1">
                  Messages from blocked contacts won't appear in your inbox. This is app-level only and doesn't affect Instagram/Facebook.
                </p>
              </div>
              {hasChanges && (
                <button
                  onClick={handleSaveBlocklist}
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="card-body">
            {loading ? (
              <div className="py-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                <p className="mt-2 text-theme-secondary text-sm">Loading...</p>
              </div>
            ) : (
              <>
                {/* Current Blocklist */}
                {blocklist.length === 0 ? (
                  <div className="text-center py-8">
                    <UserX className="h-12 w-12 text-theme-tertiary mx-auto mb-3 opacity-50" />
                    <p className="text-theme-secondary text-sm">No blocked contacts</p>
                    <p className="text-theme-tertiary text-xs mt-1">Add contacts below to hide them from your inbox</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-6">
                    <h3 className="text-sm font-medium text-theme-secondary mb-2">
                      Blocked Contacts ({blocklist.length})
                    </h3>
                    <div className="space-y-2">
                      {blocklist.map(contact => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-3 bg-theme-primary rounded-lg border border-theme"
                        >
                          <div className="flex items-center gap-3">
                            {contact.avatar ? (
                              <img
                                src={contact.avatar}
                                alt={contact.name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                                <span className="text-accent font-semibold">
                                  {contact.name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-theme-primary">{contact.name}</p>
                              <p className="text-xs text-theme-tertiary capitalize">{contact.platform}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveFromBlocklist(contact.id)}
                            className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors"
                            title="Remove from blocklist"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Contacts Section */}
                <div className="border-t border-theme pt-6">
                  <h3 className="text-sm font-medium text-theme-secondary mb-3">Add Contacts to Blocklist</h3>
                  
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-theme-tertiary" />
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input pl-10"
                    />
                  </div>

                  {/* Contact List */}
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredContacts.length === 0 ? (
                      <p className="text-center text-theme-secondary text-sm py-4">
                        {searchQuery ? 'No contacts found' : 'No contacts available'}
                      </p>
                    ) : (
                      filteredContacts.map(contact => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-3 bg-theme-primary rounded-lg border border-theme hover:border-accent/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {contact.avatar ? (
                              <img
                                src={contact.avatar}
                                alt={contact.name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                                <span className="text-accent font-semibold">
                                  {contact.name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-theme-primary">{contact.name}</p>
                              <p className="text-xs text-theme-tertiary capitalize">{contact.platform}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddToBlocklist(contact)}
                            className="btn btn-sm btn-secondary"
                          >
                            Block
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Mock data for development
function getMockBlocklist() {
  return [
    {
      id: '5',
      name: 'Personal Friend',
      avatar: null,
      platform: 'instagram'
    }
  ]
}

function getMockContacts() {
  return [
    {
      id: '1',
      name: 'Sarah Johnson',
      avatar: null,
      platform: 'instagram'
    },
    {
      id: '2',
      name: 'Brand Partnerships',
      avatar: null,
      platform: 'instagram'
    },
    {
      id: '3',
      name: 'Mike Chen',
      avatar: null,
      platform: 'facebook'
    },
    {
      id: '4',
      name: 'Emily Rodriguez',
      avatar: null,
      platform: 'instagram'
    },
    {
      id: '6',
      name: 'John Doe',
      avatar: null,
      platform: 'instagram'
    },
    {
      id: '7',
      name: 'Marketing Team',
      avatar: null,
      platform: 'facebook'
    }
  ]
}
