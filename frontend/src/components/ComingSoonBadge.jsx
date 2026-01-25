import { Clock } from 'lucide-react';

/**
 * ComingSoonBadge Component
 * A reusable badge to indicate features that are not yet available
 */
export default function ComingSoonBadge({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5'
  };

  return (
    <span 
      className={`inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full font-medium ${sizeClasses[size]} ${className}`}
      title="This feature is not yet available"
    >
      <Clock className={iconSizes[size]} />
      Coming Soon
    </span>
  );
}
