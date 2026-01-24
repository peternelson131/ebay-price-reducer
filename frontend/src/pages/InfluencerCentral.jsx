import { useState, useEffect, lazy, Suspense } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Menu, ClipboardList, BookOpen, Upload, Package, ShoppingBag, Share2 } from 'lucide-react';
import { userAPI } from '../lib/supabase';

// Lazy load the content components
const InfluencerAsinCorrelation = lazy(() => import('./InfluencerAsinCorrelation'));
const AutoDubbing = lazy(() => import('./AutoDubbing'));
const InfluencerTaskList = lazy(() => import('./InfluencerTaskList'));
const AsinCatalog = lazy(() => import('./AsinCatalog'));
const CatalogImport = lazy(() => import('./CatalogImport'));
const WhatNotAnalysis = lazy(() => import('./WhatNotAnalysis'));
const ProductCRM = lazy(() => import('./ProductCRM'));
const SocialPosts = lazy(() => import('./SocialPosts'));

// Menu item configuration - organized by category
const productItems = [
  {
    id: 'product-crm',
    label: 'CRM',
    icon: ShoppingBag,
    component: ProductCRM,
    badge: null
  },
  {
    id: 'posts',
    label: 'Schedule',
    icon: Share2,
    component: SocialPosts,
    badge: null
  },
  {
    id: 'task-list',
    label: 'Upload Task',
    icon: ClipboardList,
    component: InfluencerTaskList,
    badge: 'pending' // Special: will show pending task count
  },
  {
    id: 'asin-correlation',
    label: 'Asin Correlation Finder',
    icon: Search,
    component: InfluencerAsinCorrelation,
    badge: null
  },
  {
    id: 'auto-dubbing',
    label: 'Auto-Dubbing Catalog',
    icon: null,
    customIcon: '🎙️',
    component: AutoDubbing,
    badge: null
  }
];

const catalogItems = [
  {
    id: 'catalog',
    label: 'ASIN Catalog',
    icon: BookOpen,
    component: AsinCatalog,
    badge: null
  },
  {
    id: 'catalog-import',
    label: 'Catalog Import',
    icon: Upload,
    component: CatalogImport,
    badge: null
  }
];

const otherItems = [
  {
    id: 'whatnot-analysis',
    label: 'WhatNot Analysis',
    icon: Package,
    component: WhatNotAnalysis,
    badge: null
  }
];

// Combine all menu items for lookup
const menuItems = [...productItems, ...catalogItems, ...otherItems];

// Get initial tab from URL hash or default to Product CRM
const getTabFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  const validTabs = menuItems.map(m => m.id);
  return validTabs.includes(hash) ? hash : 'product-crm';
};

export default function InfluencerCentral() {
  const [activeItem, setActiveItem] = useState(getTabFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [catalogExpanded, setCatalogExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);

  // Sync with URL hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setActiveItem(getTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load pending task count
  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const token = await userAPI.getAuthToken();
        const response = await fetch('/.netlify/functions/influencer-tasks?status=pending', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
          setPendingTaskCount(data.pendingCount || 0);
        }
      } catch (err) {
        console.error('Failed to load pending task count:', err);
      }
    };
    loadPendingCount();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeMenuItem = menuItems.find(item => item.id === activeItem);
  const ActiveComponent = activeMenuItem?.component;

  const handleMenuClick = (itemId) => {
    setActiveItem(itemId);
    setMobileSidebarOpen(false); // Close mobile sidebar on selection
    // Update URL hash for persistence
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
            Influencer Tools
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
          {/* Products Collapsible Section */}
          <div className="mb-1">
            <button
              onClick={() => setProductsExpanded(!productsExpanded)}
              className="w-full flex items-center px-4 py-2 text-left text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors duration-150"
            >
              <ChevronDown 
                className={`w-4 h-4 mr-2 transition-transform duration-200 ${productsExpanded ? 'rotate-0' : '-rotate-90'}`}
              />
              <span className="text-sm font-medium">Products</span>
            </button>
            
            {/* Products Menu Items */}
            {productsExpanded && (
              <div className="ml-2">
                {productItems.map((item) => {
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
                      
                      {/* Label and Badge */}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">
                          {item.label}
                        </span>
                      </span>
                      
                      {/* Pending task badge */}
                      {item.badge === 'pending' && pendingTaskCount > 0 && (
                        <span className={`
                          ml-2 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse
                          ${isActive 
                            ? 'bg-white/30 text-white' 
                            : 'bg-error text-white'
                          }
                        `}>
                          {pendingTaskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Catalog Collapsible Section */}
          <div className="mb-1">
            <button
              onClick={() => setCatalogExpanded(!catalogExpanded)}
              className="w-full flex items-center px-4 py-2 text-left text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors duration-150"
            >
              <ChevronDown 
                className={`w-4 h-4 mr-2 transition-transform duration-200 ${catalogExpanded ? 'rotate-0' : '-rotate-90'}`}
              />
              <span className="text-sm font-medium">Catalog</span>
            </button>
            
            {/* Catalog Menu Items */}
            {catalogExpanded && (
              <div className="ml-2">
                {catalogItems.map((item) => {
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
              </div>
            )}
          </div>

          {/* Other Collapsible Section */}
          <div className="mb-1">
            <button
              onClick={() => setOtherExpanded(!otherExpanded)}
              className="w-full flex items-center px-4 py-2 text-left text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors duration-150"
            >
              <ChevronDown 
                className={`w-4 h-4 mr-2 transition-transform duration-200 ${otherExpanded ? 'rotate-0' : '-rotate-90'}`}
              />
              <span className="text-sm font-medium">Other</span>
            </button>
            
            {/* Other Menu Items */}
            {otherExpanded && (
              <div className="ml-2">
                {otherItems.map((item) => {
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
              </div>
            )}
          </div>
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

        {/* Collapsed state icon strip (Tablet and Desktop) */}
        {!sidebarOpen && (
          <div className="hidden md:flex flex-col items-center py-4 space-y-2">
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
                      : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-primary'
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
            
            {/* Expand button at bottom */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="mt-auto p-2 rounded-lg text-theme-tertiary hover:text-theme-secondary hover:bg-theme-hover transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile Header with Menu Toggle */}
        <div className="lg:hidden flex items-center p-4 border-b border-theme bg-theme-surface">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-hover mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-theme-primary">
            {activeMenuItem?.label || 'Influencer Central'}
          </h1>
        </div>

        {/* Content */}
        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
              <p className="mt-2 text-theme-secondary">Loading...</p>
            </div>
          </div>
        }>
          {ActiveComponent && <ActiveComponent />}
        </Suspense>
      </main>
    </div>
  );
}
