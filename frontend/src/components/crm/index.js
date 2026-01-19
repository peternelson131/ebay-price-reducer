/**
 * CRM Components Index
 * 
 * Export all CRM-related components for easy importing.
 */

export { default as ProductList } from './ProductList';
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
} from './ProductList';

export { default as ProductStatusBadge } from './ProductStatusBadge';
export { 
  StatusDot, 
  STATUS_CONFIG, 
  getStatusConfig, 
  getAvailableStatuses 
} from './ProductStatusBadge';

export { default as CustomizableDropdown } from './CustomizableDropdown';
