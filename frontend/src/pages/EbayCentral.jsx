import { useState, useEffect, lazy, Suspense } from 'react';
import { List, TrendingDown, Zap, ChevronLeft, ChevronRight, Menu } from 'lucide-react';

// Lazy load the content components
const Listings = lazy(() => import('./Listings'));
const Strategies = lazy(() => import('./Strategies'));
const QuickList = lazy(() => import('./QuickList'));

// Menu item configuration
const menuItems = [
  {
    id: 'listings',
    label: 'Listings',
    icon: List,
    component: Listings,
    description: 'Manage your eBay inventory'
  },
  {
    id: 'strategies',
    label: 'Price Strategies',
    icon: TrendingDown,
    component: Strategies,
    description: 'Configure pricing rules'
  },
  {
    id: 'quick-list',
    label: 'Quick List',
    icon: Zap,
    component: QuickList,
    description: 'Fast listing creation'
  }
];

// Get initial tab from URL hash or default
const getTabFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  const validTabs = menuItems.map(m => m.id);
  return validTabs.includes(hash) ? hash : 'listings';
};

export default function EbayCentral() {
  const [activeItem, setActiveItem] = useState(getTabFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Sync with URL hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setActiveItem(getTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeMenuItem = menuItems.find(item => item.id === activeItem);
  const ActiveComponent = activeMenuItem?.component;

  const handleMenuClick = (itemId) => {
    setActiveItem(itemId);
    setMobileSidebarOpen(false);
    window.location.hash = itemId;
  };

  return (
    <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Side Panel */}
      <aside
        className={`
          ${sidebarOpen ? 'w-64' : 'w-0 lg:w-12'}
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:relative inset-y-0 left-0 z-40 lg:z-0
          bg-theme-surface border-r border-theme
          transition-all duration-300 ease-in-out
          flex flex-col overflow-hidden
          h-full
        `}
      >
        {/* Sidebar Header */}
        <div className={`
          flex items-center justify-between p-4 border-b border-theme
          ${!sidebarOpen && 'lg:hidden'}
        `}>
          <h2 className="font-semibold text-theme-primary text-sm uppercase tracking-wide">
            eBay Tools
          </h2>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-theme-hover text-theme-secondary"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <nav className={`flex-1 py-2 ${!sidebarOpen && 'md:hidden'}`}>
          {menuItems.map((item) => {
            const isActive = activeItem === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`
                  w-full flex items-center px-4 py-3 text-left
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-accent text-white'
                    : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-primary'
                  }
                `}
              >
                {/* Icon */}
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center mr-3">
                  {item.customIcon ? (
                    <span className="text-lg">{item.customIcon}</span>
                  ) : Icon ? (
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  ) : null}
                </span>
                
                {/* Label */}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {item.label}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle (Tablet and Desktop) */}
        <div className="hidden md:block border-t border-theme p-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-theme-tertiary hover:text-theme-secondary hover:bg-theme-hover transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Collapsed Sidebar Icons (Tablet and Desktop) */}
      {!sidebarOpen && (
        <aside className="hidden md:flex w-12 flex-col items-center py-4 bg-theme-surface border-r border-theme gap-2">
          {menuItems.map((item) => {
            const isActive = activeItem === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`
                  p-2 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-accent text-white'
                    : 'text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover'
                  }
                `}
                title={item.label}
              >
                {item.customIcon ? (
                  <span className="text-lg">{item.customIcon}</span>
                ) : Icon ? (
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                ) : null}
              </button>
            );
          })}
          
          {/* Expand button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="mt-auto p-2 rounded-lg text-theme-tertiary hover:text-theme-secondary hover:bg-theme-hover transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </aside>
      )}

      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-20 p-3 bg-accent text-white rounded-full shadow-lg"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-theme-primary">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        }>
          {ActiveComponent && <ActiveComponent />}
        </Suspense>
      </main>
    </div>
  );
}
