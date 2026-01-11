import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * AdminSettings - Deprecated
 * 
 * eBay App credentials (Client ID, Client Secret) are now platform-level
 * and stored in Netlify environment variables.
 * 
 * Users only need to connect via OAuth - no credential entry needed.
 * This page redirects to the Account integrations tab.
 */
export default function AdminSettings() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to the account integrations page
    navigate('/account?tab=integrations', { replace: true })
  }, [navigate])

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
          <p className="text-text-secondary">Redirecting to Account Settings...</p>
        </div>
      </div>
    </div>
  )
}
