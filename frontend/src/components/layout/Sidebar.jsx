import { Link, useLocation } from 'react-router-dom'
import {
  HomeIcon,
  ListBulletIcon,
  CogIcon,
  XMarkIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Listings', href: '/listings', icon: ListBulletIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
]

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation()

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-theme-surface border-r border-theme transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:inset-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-theme md:hidden">
          <h2 className="text-lg font-semibold text-theme-primary">Menu</h2>
          <button
            type="button"
            className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-colors"
            onClick={onClose}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-5 px-2 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`
                  group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150
                  ${isActive
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-primary'
                  }
                `}
                onClick={() => onClose()}
              >
                <item.icon className={`
                  mr-3 h-5 w-5 flex-shrink-0
                  ${isActive ? 'text-white' : 'text-theme-tertiary group-hover:text-theme-secondary'}
                `} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="bg-theme-primary rounded-lg border border-theme p-3">
            <div className="text-xs text-theme-tertiary mb-1">Quick Stats</div>
            <div className="text-sm font-medium text-theme-primary">
              5 Active Listings
            </div>
            <div className="text-xs text-theme-tertiary">
              Last sync: 2 min ago
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
