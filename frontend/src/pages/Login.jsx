import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, authAPI } from '../lib/supabase'

export default function Login({ onLogin }) {
  const [currentView, setCurrentView] = useState('login') // 'login', 'signup', 'forgot', 'reset'
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  })
  const [forgotData, setForgotData] = useState({
    email: '',
    username: ''
  })
  const [resetData, setResetData] = useState({
    code: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [notification, setNotification] = useState(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const validateLogin = () => {
    const newErrors = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateSignup = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required'
    }

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateForgot = () => {
    const newErrors = {}

    if (!forgotData.email.trim() && !forgotData.username.trim()) {
      newErrors.general = 'Please provide either email or username'
    }

    if (forgotData.email && !/\S+@\S+\.\S+/.test(forgotData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateReset = () => {
    const newErrors = {}

    if (!resetData.code.trim()) {
      newErrors.code = 'Reset code is required'
    }

    if (!resetData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (resetData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters'
    }

    if (resetData.newPassword !== resetData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!validateLogin()) return

    setIsLoading(true)
    setErrors({})

    try {
      const result = await authAPI.signIn(formData.email || formData.username, formData.password)

      if (result.error) {
        setErrors({ general: result.error.message })
      } else {
        const userData = {
          username: result.data.user.email,
          name: result.data.user.user_metadata?.name || result.data.user.email,
          email: result.data.user.email,
          id: result.data.user.id
        }
        showNotification('success', 'Login successful! Redirecting...')
        setTimeout(() => onLogin(userData), 1000)
      }
    } catch (err) {
      setErrors({ general: err.message || 'Login failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (!validateSignup()) return

    setIsLoading(true)
    setErrors({})

    try {
      const result = await authAPI.signUp(formData.email, formData.password, {
        name: formData.name,
        username: formData.username
      })

      if (result.error) {
        setErrors({ general: result.error.message })
      } else {
        showNotification('success', 'Account created successfully! Please check your email to verify your account.')
        setCurrentView('login')
      }
    } catch (err) {
      setErrors({ general: err.message || 'An error occurred during signup' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    if (!validateForgot()) return

    setIsLoading(true)
    setErrors({})

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (forgotData.email) {
        await authAPI.resetPassword(forgotData.email)
      }

      showNotification('success', 'Reset code sent! Check your email.')
      setCurrentView('reset')
    } catch (error) {
      setErrors({ general: 'Failed to send reset code. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetSubmit = async (e) => {
    e.preventDefault()
    if (!validateReset()) return

    setIsLoading(true)
    setErrors({})

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      showNotification('success', 'Password reset successful! You can now login.')
      setCurrentView('login')
      setResetData({ code: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setErrors({ general: 'Password reset failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const inputClasses = (hasError) => `
    w-full px-3 py-2.5 bg-theme-primary border rounded-lg text-theme-primary placeholder-text-tertiary
    focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors
    ${hasError ? 'border-error' : 'border-theme'}
  `

  const labelClasses = "block text-sm font-medium text-theme-secondary mb-1.5"

  const renderLoginForm = () => (
    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label htmlFor="username" className={labelClasses}>
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleInputChange}
          className={inputClasses(errors.username)}
          placeholder="Enter your username"
        />
        {errors.username && <p className="text-error text-sm mt-1">{errors.username}</p>}
      </div>

      <div>
        <label htmlFor="password" className={labelClasses}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleInputChange}
          className={inputClasses(errors.password)}
          placeholder="Enter your password"
        />
        {errors.password && <p className="text-error text-sm mt-1">{errors.password}</p>}
      </div>

      {errors.general && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="text-error text-sm">{errors.general}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            className="h-4 w-4 bg-theme-primary border-theme rounded text-accent focus:ring-accent"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-theme-secondary">
            Remember me
          </label>
        </div>

        <button
          type="button"
          onClick={() => setCurrentView('forgot')}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-accent text-white py-2.5 px-4 rounded-lg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isLoading ? 'Signing In...' : 'Sign In'}
      </button>

      <div className="text-center">
        <span className="text-sm text-theme-tertiary">Don't have an account? </span>
        <button
          type="button"
          onClick={() => setCurrentView('signup')}
          className="text-accent hover:text-accent-hover text-sm font-medium transition-colors"
        >
          Sign up
        </button>
      </div>
    </form>
  )

  const renderSignupForm = () => (
    <form onSubmit={handleSignup} className="space-y-5">
      <div>
        <label htmlFor="name" className={labelClasses}>
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleInputChange}
          className={inputClasses(errors.name)}
          placeholder="Enter your full name"
        />
        {errors.name && <p className="text-error text-sm mt-1">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="signup-username" className={labelClasses}>
          Username
        </label>
        <input
          id="signup-username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleInputChange}
          className={inputClasses(errors.username)}
          placeholder="Choose a username"
        />
        {errors.username && <p className="text-error text-sm mt-1">{errors.username}</p>}
      </div>

      <div>
        <label htmlFor="email" className={labelClasses}>
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleInputChange}
          className={inputClasses(errors.email)}
          placeholder="Enter your email address"
        />
        {errors.email && <p className="text-error text-sm mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="signup-password" className={labelClasses}>
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleInputChange}
          className={inputClasses(errors.password)}
          placeholder="Create a password"
        />
        {errors.password && <p className="text-error text-sm mt-1">{errors.password}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClasses}>
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          className={inputClasses(errors.confirmPassword)}
          placeholder="Confirm your password"
        />
        {errors.confirmPassword && <p className="text-error text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      {errors.general && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="text-error text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-accent text-white py-2.5 px-4 rounded-lg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isLoading ? 'Creating Account...' : 'Create Account'}
      </button>

      <div className="text-center">
        <span className="text-sm text-theme-tertiary">Already have an account? </span>
        <button
          type="button"
          onClick={() => setCurrentView('login')}
          className="text-accent hover:text-accent-hover text-sm font-medium transition-colors"
        >
          Sign in
        </button>
      </div>
    </form>
  )

  const renderForgotForm = () => (
    <form onSubmit={handleForgotSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-theme-primary">Reset Your Credentials</h3>
        <p className="text-sm text-theme-tertiary mt-1">
          Enter your email or username and we'll send you a reset code
        </p>
      </div>

      <div>
        <label htmlFor="forgot-email" className={labelClasses}>
          Email Address
        </label>
        <input
          id="forgot-email"
          type="email"
          value={forgotData.email}
          onChange={(e) => setForgotData(prev => ({ ...prev, email: e.target.value }))}
          className={inputClasses(errors.email)}
          placeholder="Enter your email address"
        />
        {errors.email && <p className="text-error text-sm mt-1">{errors.email}</p>}
      </div>

      <div className="text-center text-sm text-theme-tertiary">
        — OR —
      </div>

      <div>
        <label htmlFor="forgot-username" className={labelClasses}>
          Username
        </label>
        <input
          id="forgot-username"
          type="text"
          value={forgotData.username}
          onChange={(e) => setForgotData(prev => ({ ...prev, username: e.target.value }))}
          className={inputClasses(false)}
          placeholder="Enter your username"
        />
      </div>

      {errors.general && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="text-error text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-accent text-white py-2.5 px-4 rounded-lg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isLoading ? 'Sending Reset Code...' : 'Send Reset Code'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setCurrentView('login')}
          className="text-accent hover:text-accent-hover text-sm transition-colors"
        >
          Back to Login
        </button>
      </div>
    </form>
  )

  const renderResetForm = () => (
    <form onSubmit={handleResetSubmit} className="space-y-5">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-theme-primary">Reset Your Password</h3>
        <p className="text-sm text-theme-tertiary mt-1">
          Enter the reset code sent to your email and create a new password
        </p>
      </div>

      <div>
        <label htmlFor="reset-code" className={labelClasses}>
          Reset Code
        </label>
        <input
          id="reset-code"
          type="text"
          value={resetData.code}
          onChange={(e) => setResetData(prev => ({ ...prev, code: e.target.value }))}
          className={inputClasses(errors.code)}
          placeholder="Enter reset code"
        />
        {errors.code && <p className="text-error text-sm mt-1">{errors.code}</p>}
      </div>

      <div>
        <label htmlFor="new-password" className={labelClasses}>
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          value={resetData.newPassword}
          onChange={(e) => setResetData(prev => ({ ...prev, newPassword: e.target.value }))}
          className={inputClasses(errors.newPassword)}
          placeholder="Enter new password"
        />
        {errors.newPassword && <p className="text-error text-sm mt-1">{errors.newPassword}</p>}
      </div>

      <div>
        <label htmlFor="confirm-new-password" className={labelClasses}>
          Confirm Password
        </label>
        <input
          id="confirm-new-password"
          type="password"
          value={resetData.confirmPassword}
          onChange={(e) => setResetData(prev => ({ ...prev, confirmPassword: e.target.value }))}
          className={inputClasses(errors.confirmPassword)}
          placeholder="Confirm new password"
        />
        {errors.confirmPassword && <p className="text-error text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      {errors.general && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="text-error text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-accent text-white py-2.5 px-4 rounded-lg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isLoading ? 'Resetting Password...' : 'Reset Password'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setCurrentView('forgot')}
          className="text-accent hover:text-accent-hover text-sm transition-colors"
        >
          Back to Reset
        </button>
      </div>
    </form>
  )

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-theme-primary">
            eBay Price Reducer
          </h2>
          <p className="mt-2 text-sm text-theme-tertiary">
            {currentView === 'login' && 'Sign in to your account'}
            {currentView === 'signup' && 'Create your account'}
            {currentView === 'forgot' && 'Reset your credentials'}
            {currentView === 'reset' && 'Create new password'}
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-theme-surface py-8 px-4 border border-theme rounded-xl sm:px-10">
          {/* Notification Banner */}
          {notification && (
            <div className={`rounded-lg p-3 mb-6 ${
              notification.type === 'success'
                ? 'bg-success/10 border border-success/30'
                : 'bg-error/10 border border-error/30'
            }`}>
              <div className={`text-sm ${
                notification.type === 'success' ? 'text-success' : 'text-error'
              }`}>
                {notification.message}
              </div>
            </div>
          )}

          {currentView === 'login' && renderLoginForm()}
          {currentView === 'signup' && renderSignupForm()}
          {currentView === 'forgot' && renderForgotForm()}
          {currentView === 'reset' && renderResetForm()}

          {/* Features List */}
          <div className="mt-8 pt-6 border-t border-theme">
            <h3 className="text-sm font-medium text-theme-secondary mb-3">
              Features:
            </h3>
            <ul className="text-xs text-theme-tertiary space-y-1.5">
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Automated price reduction strategies
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Real-time market analysis
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Custom minimum price protection
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Multiple pricing algorithms
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Detailed price history tracking
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-accent rounded-full mr-2"></span>
                Bulk listing management
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
