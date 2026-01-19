/**
 * ProductList Component
 * 
 * Main product list view for the Product CRM.
 * Features: sortable columns, filtering, pagination, loading/empty/error states.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Package,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MoreVertical,
  Clock,
  Truck,
  CheckCircle,
  AlertCircle,
  X,
  Users
} from 'lucide-react';
import ProductStatusBadge from './ProductStatusBadge';

// Shipping status configuration
const SHIPPING_STATUS_CONFIG = {
  'pending': { icon: Clock, label: 'Pending', color: 'text-gray-500' },
  'label_created': { icon: Package, label: 'Label Created', color: 'text-blue-500' },
  'picked_up': { icon: Truck, label: 'Picked Up', color: 'text-blue-500' },
  'in_transit': { icon: Truck, label: 'In Transit', color: 'text-yellow-500' },
  'out_for_delivery': { icon: Truck, label: 'Out for Delivery', color: 'text-orange-500' },
  'delivered': { icon: CheckCircle, label: 'Delivered', color: 'text-green-500' },
  'exception': { icon: AlertCircle, label: 'Exception', color: 'text-red-500' },
  'returned': { icon: Package, label: 'Returned', color: 'text-red-500' }
};

// Default page size options
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * ShippingBadge Component - Shows shipping status with icon
 */
const ShippingBadge = ({ status }) => {
  const config = SHIPPING_STATUS_CONFIG[status] || SHIPPING_STATUS_CONFIG['pending'];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

/**
 * OwnerAvatars Component - Shows owner avatars with overflow
 */
const OwnerAvatars = ({ owners, max = 3 }) => {
  if (!owners || owners.length === 0) {
    return <span className="text-gray-400 text-sm">No owner</span>;
  }
  
  const displayed = owners.slice(0, max);
  const remaining = owners.length - max;
  
  return (
    <div className="flex items-center -space-x-2">
      {displayed.map((owner, i) => (
        <div
          key={owner.id || i}
          className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium border-2 border-white dark:border-gray-800"
          title={owner.name || owner.email}
        >
          {(owner.name || owner.email || '?')[0].toUpperCase()}
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-medium border-2 border-white dark:border-gray-800">
          +{remaining}
        </div>
      )}
    </div>
  );
};

/**
 * SortableHeader Component - Table header with sort functionality
 */
const SortableHeader = ({ 
  label, 
  sortKey, 
  currentSort, 
  onSort,
  className = ''
}) => {
  const isActive = currentSort.key === sortKey;
  const direction = isActive ? currentSort.direction : null;
  
  const handleClick = () => {
    if (isActive) {
      // Toggle direction or clear
      onSort(sortKey, direction === 'asc' ? 'desc' : direction === 'desc' ? null : 'asc');
    } else {
      onSort(sortKey, 'asc');
    }
  };
  
  return (
    <th 
      className={`text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors ${className}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="text-gray-400">
          {direction === 'asc' ? (
            <ChevronUp className="w-4 h-4" />
          ) : direction === 'desc' ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronsUpDown className="w-3 h-3 opacity-50" />
          )}
        </span>
      </div>
    </th>
  );
};

/**
 * ProductRow Component - Individual product row
 */
const ProductRow = ({ 
  product, 
  isSelected, 
  onSelect, 
  onAction 
}) => {
  const amazonUrl = `https://amazon.com/dp/${product.asin}`;
  
  return (
    <tr 
      className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
      onClick={() => onSelect(product)}
    >
      {/* Image */}
      <td className="py-3 px-4">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          {product.image_url ? (
            <img 
              src={product.image_url} 
              alt={product.asin} 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <Package className={`w-6 h-6 text-gray-400 ${product.image_url ? 'hidden' : ''}`} />
        </div>
      </td>
      
      {/* ASIN */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{product.asin}</span>
          <a
            href={amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-gray-400 hover:text-blue-500 transition-colors"
            title="View on Amazon"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        {product.title && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs mt-0.5">
            {product.title}
          </p>
        )}
      </td>
      
      {/* Status */}
      <td className="py-3 px-4">
        <ProductStatusBadge status={product.status?.name || product.status_name || 'Sourcing'} />
      </td>
      
      {/* Owners */}
      <td className="py-3 px-4">
        <OwnerAvatars owners={product.owners} />
      </td>
      
      {/* Decision */}
      <td className="py-3 px-4">
        <span className={`text-sm font-medium ${
          product.decision === 'sell' ? 'text-green-600 dark:text-green-400' : 
          product.decision === 'keep' ? 'text-blue-600 dark:text-blue-400' : 
          'text-gray-400'
        }`}>
          {product.decision ? product.decision.charAt(0).toUpperCase() + product.decision.slice(1) : '-'}
        </span>
      </td>
      
      {/* Shipping */}
      <td className="py-3 px-4">
        {product.tracking_number ? (
          <ShippingBadge status={product.shipping_status || 'pending'} />
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </td>
      
      {/* Actions */}
      <td className="py-3 px-4">
        <button
          onClick={e => { e.stopPropagation(); onAction && onAction(product, 'menu'); }}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

/**
 * Pagination Component
 */
const Pagination = ({ 
  currentPage, 
  totalPages, 
  pageSize, 
  totalItems, 
  onPageChange, 
  onPageSizeChange 
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
      {/* Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Show</span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">per page</span>
      </div>
      
      {/* Item count */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {totalItems > 0 ? (
          <>Showing {startItem}-{endItem} of {totalItems}</>
        ) : (
          'No items'
        )}
      </div>
      
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        {/* Page numbers */}
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (currentPage <= 3) {
            pageNum = i + 1;
          } else if (currentPage >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = currentPage - 2 + i;
          }
          
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-8 h-8 text-sm rounded ${
                currentPage === pageNum
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

/**
 * FilterBar Component
 */
const FilterBar = ({ 
  searchQuery, 
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  statuses = [],
  owners = [],
  onRefresh,
  isLoading
}) => {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by ASIN..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Status Filter */}
      <div className="relative">
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none cursor-pointer"
        >
          <option value="">All Statuses</option>
          {statuses.map(status => (
            <option key={status.id || status.name} value={status.id || status.name}>
              {status.name}
            </option>
          ))}
        </select>
        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
      
      {/* Owner Filter */}
      {owners.length > 0 && (
        <div className="relative">
          <select
            value={ownerFilter}
            onChange={e => onOwnerFilterChange(e.target.value)}
            className="pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none cursor-pointer"
          >
            <option value="">All Owners</option>
            {owners.map(owner => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email}
              </option>
            ))}
          </select>
          <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      )}
      
      {/* Refresh Button */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="p-2 text-gray-400 hover:text-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};

/**
 * LoadingState Component
 */
const LoadingState = () => (
  <div className="p-12 text-center">
    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
    <p className="text-gray-500 dark:text-gray-400 mt-2">Loading products...</p>
  </div>
);

/**
 * ErrorState Component
 */
const ErrorState = ({ error, onRetry }) => (
  <div className="p-12 text-center">
    <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
    <p className="text-red-500 mt-2">{error}</p>
    <button 
      onClick={onRetry} 
      className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
    >
      Try again
    </button>
  </div>
);

/**
 * EmptyState Component
 */
const EmptyState = ({ onAdd, hasFilters }) => (
  <div className="p-12 text-center">
    <Package className="w-12 h-12 text-gray-300 mx-auto" />
    <h3 className="text-lg font-medium text-gray-900 dark:text-white mt-4">
      {hasFilters ? 'No products match your filters' : 'No products yet'}
    </h3>
    <p className="text-gray-500 dark:text-gray-400 mt-1">
      {hasFilters 
        ? 'Try adjusting your search or filters' 
        : 'Add your first product to get started'}
    </p>
    {!hasFilters && onAdd && (
      <button
        onClick={onAdd}
        className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
      >
        + Add your first product
      </button>
    )}
  </div>
);

/**
 * Main ProductList Component
 * 
 * @param {object} props
 * @param {Array} props.products - Array of product objects
 * @param {boolean} props.isLoading - Loading state
 * @param {string} props.error - Error message
 * @param {object} props.selectedProduct - Currently selected product
 * @param {function} props.onSelectProduct - Callback when product is selected
 * @param {function} props.onProductAction - Callback for product actions (edit, delete, etc)
 * @param {function} props.onRefresh - Callback to refresh data
 * @param {function} props.onAddProduct - Callback to add new product
 * @param {Array} props.statuses - Available status options
 * @param {Array} props.owners - Available owner options
 */
export default function ProductList({
  products = [],
  isLoading = false,
  error = null,
  selectedProduct = null,
  onSelectProduct,
  onProductAction,
  onRefresh,
  onAddProduct,
  statuses = [],
  owners = []
}) {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  
  // Sort state
  const [sort, setSort] = useState({ key: null, direction: null });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Handle sort change
  const handleSort = useCallback((key, direction) => {
    setSort({ key, direction });
    setCurrentPage(1); // Reset to first page on sort change
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = [...products];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.asin?.toLowerCase().includes(query) ||
        p.title?.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(p => 
        p.status_id === statusFilter || 
        p.status?.id === statusFilter ||
        p.status?.name === statusFilter
      );
    }
    
    // Owner filter
    if (ownerFilter) {
      filtered = filtered.filter(p => 
        p.owners?.some(o => o.id === ownerFilter)
      );
    }
    
    return filtered;
  }, [products, searchQuery, statusFilter, ownerFilter]);

  // Sort products
  const sortedProducts = useMemo(() => {
    if (!sort.key || !sort.direction) return filteredProducts;
    
    return [...filteredProducts].sort((a, b) => {
      let aVal, bVal;
      
      switch (sort.key) {
        case 'asin':
          aVal = a.asin || '';
          bVal = b.asin || '';
          break;
        case 'status':
          aVal = a.status?.name || a.status_name || '';
          bVal = b.status?.name || b.status_name || '';
          break;
        case 'decision':
          aVal = a.decision || '';
          bVal = b.decision || '';
          break;
        case 'shipping':
          aVal = a.shipping_status || '';
          bVal = b.shipping_status || '';
          break;
        case 'created_at':
          aVal = new Date(a.created_at || 0);
          bVal = new Date(b.created_at || 0);
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProducts, sort]);

  // Paginate products
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, currentPage, pageSize]);

  // Calculate total pages
  const totalPages = Math.ceil(sortedProducts.length / pageSize);

  // Reset page when filters change
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleOwnerFilterChange = (value) => {
    setOwnerFilter(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const hasFilters = searchQuery || statusFilter || ownerFilter;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Filter Bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={handleOwnerFilterChange}
          statuses={statuses}
          owners={owners}
          onRefresh={onRefresh}
          isLoading={isLoading}
        />
      </div>

      {/* Content */}
      {isLoading && products.length === 0 ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={onRefresh} />
      ) : sortedProducts.length === 0 ? (
        <EmptyState onAdd={onAddProduct} hasFilters={hasFilters} />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 w-16">
                    Image
                  </th>
                  <SortableHeader 
                    label="ASIN" 
                    sortKey="asin" 
                    currentSort={sort} 
                    onSort={handleSort} 
                  />
                  <SortableHeader 
                    label="Status" 
                    sortKey="status" 
                    currentSort={sort} 
                    onSort={handleSort} 
                  />
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4">
                    Owners
                  </th>
                  <SortableHeader 
                    label="Decision" 
                    sortKey="decision" 
                    currentSort={sort} 
                    onSort={handleSort} 
                  />
                  <SortableHeader 
                    label="Shipping" 
                    sortKey="shipping" 
                    currentSort={sort} 
                    onSort={handleSort} 
                  />
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider py-3 px-4 w-12">
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map(product => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    isSelected={selectedProduct?.id === product.id}
                    onSelect={onSelectProduct}
                    onAction={onProductAction}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={sortedProducts.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}
    </div>
  );
}

// Export sub-components for flexibility
export { 
  ShippingBadge, 
  OwnerAvatars, 
  ProductRow, 
  FilterBar, 
  Pagination,
  LoadingState,
  ErrorState,
  EmptyState,
  SHIPPING_STATUS_CONFIG
};
