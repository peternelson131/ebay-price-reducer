import { Bars3Icon } from '@heroicons/react/24/outline'

export default function Navbar({ onMenuClick }) {
  return (
    <nav className="bg-dark-surface border-b border-dark-border">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-dark-hover focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
              onClick={onMenuClick}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex-shrink-0 flex items-center ml-4 md:ml-0">
              <h1 className="text-xl font-semibold text-text-primary">
                eBay Price Reducer
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-success rounded-full animate-pulse"></div>
              <span className="text-sm text-text-secondary">Connected</span>
            </div>

            <div className="hidden sm:block">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">DU</span>
                </div>
                <span className="text-sm text-text-secondary">Demo User</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
