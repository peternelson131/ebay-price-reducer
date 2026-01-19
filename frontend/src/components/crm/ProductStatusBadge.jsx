/**
 * ProductStatusBadge Component
 * 
 * Colored status badge for product CRM statuses.
 * Supports both dark and light mode via Tailwind.
 */

// Status configuration with colors matching the database seed
export const STATUS_CONFIG = {
  'Sourcing': { 
    color: '#3B82F6', 
    bgClass: 'bg-blue-100 dark:bg-blue-900/30', 
    textClass: 'text-blue-700 dark:text-blue-300',
    description: 'Initial research phase'
  },
  'Review': { 
    color: '#8B5CF6', 
    bgClass: 'bg-purple-100 dark:bg-purple-900/30', 
    textClass: 'text-purple-700 dark:text-purple-300',
    description: 'Under review'
  },
  'Negotiating': { 
    color: '#F97316', 
    bgClass: 'bg-orange-100 dark:bg-orange-900/30', 
    textClass: 'text-orange-700 dark:text-orange-300',
    description: 'In negotiation'
  },
  'Committed': { 
    color: '#06B6D4', 
    bgClass: 'bg-cyan-100 dark:bg-cyan-900/30', 
    textClass: 'text-cyan-700 dark:text-cyan-300',
    description: 'Committed to purchase'
  },
  'Ordered': { 
    color: '#6366F1', 
    bgClass: 'bg-indigo-100 dark:bg-indigo-900/30', 
    textClass: 'text-indigo-700 dark:text-indigo-300',
    description: 'Order placed'
  },
  'Shipped': { 
    color: '#EAB308', 
    bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', 
    textClass: 'text-yellow-700 dark:text-yellow-300',
    description: 'Item shipped'
  },
  'In Transit': { 
    color: '#FBBF24', 
    bgClass: 'bg-amber-100 dark:bg-amber-900/30', 
    textClass: 'text-amber-700 dark:text-amber-300',
    description: 'Currently in transit'
  },
  'Delivered': { 
    color: '#10B981', 
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30', 
    textClass: 'text-emerald-700 dark:text-emerald-300',
    description: 'Package delivered'
  },
  'To Receive': { 
    color: '#F97316', 
    bgClass: 'bg-orange-100 dark:bg-orange-900/30', 
    textClass: 'text-orange-700 dark:text-orange-300',
    description: 'Awaiting receipt'
  },
  'Completed': { 
    color: '#22C55E', 
    bgClass: 'bg-green-100 dark:bg-green-900/30', 
    textClass: 'text-green-700 dark:text-green-300',
    description: 'Process complete'
  },
  'Returned': { 
    color: '#EF4444', 
    bgClass: 'bg-red-100 dark:bg-red-900/30', 
    textClass: 'text-red-700 dark:text-red-300',
    description: 'Item returned'
  },
  'Cancelled': { 
    color: '#9CA3AF', 
    bgClass: 'bg-gray-100 dark:bg-gray-700/30', 
    textClass: 'text-gray-700 dark:text-gray-300',
    description: 'Cancelled'
  },
  'Problem': { 
    color: '#DC2626', 
    bgClass: 'bg-red-100 dark:bg-red-900/30', 
    textClass: 'text-red-700 dark:text-red-300',
    description: 'Issue requiring attention'
  }
};

// Default config for unknown statuses
const DEFAULT_CONFIG = {
  color: '#6B7280',
  bgClass: 'bg-gray-100 dark:bg-gray-700/30',
  textClass: 'text-gray-700 dark:text-gray-300',
  description: 'Unknown status'
};

/**
 * Get status configuration
 * @param {string} status - Status name
 * @returns {object} Status configuration
 */
export const getStatusConfig = (status) => {
  return STATUS_CONFIG[status] || DEFAULT_CONFIG;
};

/**
 * ProductStatusBadge Component
 * 
 * @param {object} props
 * @param {string} props.status - Status name to display
 * @param {string} [props.size='md'] - Size variant: 'sm', 'md', 'lg'
 * @param {boolean} [props.showDot=false] - Show colored dot indicator
 * @param {string} [props.className] - Additional CSS classes
 */
export default function ProductStatusBadge({ 
  status, 
  size = 'md', 
  showDot = false,
  className = '' 
}) {
  const config = getStatusConfig(status);
  
  // Size classes
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm'
  };
  
  const dotSizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };
  
  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${config.bgClass} ${config.textClass}
        ${sizeClasses[size] || sizeClasses.md}
        ${className}
      `.trim()}
      title={config.description}
    >
      {showDot && (
        <span 
          className={`rounded-full ${dotSizeClasses[size] || dotSizeClasses.md}`}
          style={{ backgroundColor: config.color }}
        />
      )}
      {status || 'Unknown'}
    </span>
  );
}

/**
 * StatusDot Component - Just the colored dot
 * 
 * @param {object} props
 * @param {string} props.status - Status name
 * @param {string} [props.size='md'] - Size variant
 */
export function StatusDot({ status, size = 'md' }) {
  const config = getStatusConfig(status);
  
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };
  
  return (
    <span 
      className={`inline-block rounded-full ${sizeClasses[size] || sizeClasses.md}`}
      style={{ backgroundColor: config.color }}
      title={status}
    />
  );
}

/**
 * Get all available statuses
 * @returns {string[]} Array of status names
 */
export const getAvailableStatuses = () => Object.keys(STATUS_CONFIG);
