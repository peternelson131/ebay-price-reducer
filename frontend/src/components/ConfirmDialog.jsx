import { X } from 'lucide-react';

/**
 * ConfirmDialog Component
 * A reusable confirmation modal that matches the app's dark theme
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is open
 * @param {function} props.onClose - Called when dialog is closed/cancelled
 * @param {function} props.onConfirm - Called when confirmed
 * @param {string} props.title - Dialog title (default: "Confirm Action")
 * @param {string} props.message - Dialog message/description
 * @param {string} props.confirmText - Text for confirm button (default: "Confirm")
 * @param {string} props.cancelText - Text for cancel button (default: "Cancel")
 * @param {string} props.variant - Variant style: "danger" or "primary" (default: "danger")
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  // Button styles based on variant
  const confirmButtonClass = variant === 'danger'
    ? 'bg-error hover:bg-red-600 text-white'
    : 'bg-accent hover:bg-accent-hover text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl w-full max-w-md mx-4 animate-slideUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-text-secondary text-sm leading-relaxed">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-dark-bg/50 border-t border-dark-border rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-hover border border-dark-border rounded-lg hover:bg-dark-surface hover:text-text-primary transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
