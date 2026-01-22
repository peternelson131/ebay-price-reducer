/**
 * OwnerSelector Component
 * 
 * Multi-select dropdown for assigning owners to products.
 * Allows users to:
 * - Select existing owners from their list
 * - Add new owners via modal
 * - Mark one owner as primary
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Check, Loader, ChevronDown, Star, User } from 'lucide-react';

// Color options for owner avatars
const AVATAR_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Teal', value: '#14B8A6' },
];

/**
 * Add Owner Modal
 */
const AddOwnerModal = ({ isOpen, onClose, onSave, isSaving }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [titlePrefix, setTitlePrefix] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      await onSave({ 
        name: name.trim(), 
        email: email.trim() || null, 
        avatar_color: color,
        title_prefix: titlePrefix.trim() || null
      });
      setName('');
      setEmail('');
      setTitlePrefix('');
      setColor('#3B82F6');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save owner');
    }
  };

  const handleClose = () => {
    setName('');
    setEmail('');
    setTitlePrefix('');
    setColor('#3B82F6');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-5 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add New Owner</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter owner name..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Email Input (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Title Prefix */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Video Title Prefix
              </label>
              <input
                type="text"
                value={titlePrefix}
                onChange={(e) => setTitlePrefix(e.target.value)}
                placeholder="e.g., Honest Review"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={30}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {titlePrefix ? `Titles: "${titlePrefix} - Product Name"` : 'Leave blank to use just the product name'}
              </p>
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Avatar Color
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(({ name: colorName, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === value
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: value }}
                    title={colorName}
                  />
                ))}
              </div>
              {/* Preview */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Preview:</span>
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: color }}
                >
                  {(name || 'N')[0].toUpperCase()}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{name || 'New Owner'}</span>
              </div>
            </div>

            {/* Error */}
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Owner Badge Component
 */
const OwnerBadge = ({ owner, isPrimary, onRemove, onSetPrimary }) => (
  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm group">
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
      style={{ backgroundColor: owner.avatar_color || '#3B82F6' }}
    >
      {(owner.name || '?')[0].toUpperCase()}
    </span>
    <span className="text-gray-900 dark:text-white">{owner.name}</span>
    {isPrimary && (
      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" title="Primary Owner" />
    )}
    {!isPrimary && onSetPrimary && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSetPrimary(owner.id);
        }}
        className="text-gray-400 hover:text-yellow-500 transition-colors"
        title="Set as primary"
      >
        <Star className="w-3 h-3" />
      </button>
    )}
    {onRemove && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(owner.id);
        }}
        className="text-gray-400 hover:text-red-500 transition-colors ml-1"
        title="Remove owner"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
);

/**
 * OwnerSelector Component
 * 
 * @param {object} props
 * @param {Array} props.selectedOwners - Array of { owner_id, is_primary } objects
 * @param {function} props.onChange - Callback when selection changes: (owners) => void
 * @param {string} [props.label] - Label text
 * @param {string} [props.className] - Additional CSS classes
 */
export default function OwnerSelector({
  selectedOwners = [],
  onChange,
  label = 'Owners',
  className = '',
}) {
  const [availableOwners, setAvailableOwners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch available owners from crm_owners table
  const fetchOwners = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) return;

      const { data, error } = await supabase
        .from('crm_owners')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) throw error;
      setAvailableOwners(data || []);
    } catch (err) {
      console.error('Error fetching owners:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  // Get full owner objects for selected IDs
  const selectedOwnersFull = selectedOwners
    .map((so) => {
      const owner = availableOwners.find((o) => o.id === so.owner_id);
      return owner ? { ...owner, is_primary: so.is_primary } : null;
    })
    .filter(Boolean);

  const selectedIds = selectedOwners.map((so) => so.owner_id);

  // Handle owner toggle (add/remove)
  const handleToggleOwner = (ownerId) => {
    const isSelected = selectedIds.includes(ownerId);

    if (isSelected) {
      // Remove owner
      const newSelection = selectedOwners.filter((so) => so.owner_id !== ownerId);
      // If we removed the primary, make the first remaining one primary
      if (newSelection.length > 0 && !newSelection.some((so) => so.is_primary)) {
        newSelection[0].is_primary = true;
      }
      onChange(newSelection);
    } else {
      // Add owner
      const isPrimary = selectedOwners.length === 0; // First owner is primary
      onChange([...selectedOwners, { owner_id: ownerId, is_primary: isPrimary }]);
    }
  };

  // Handle removing an owner
  const handleRemoveOwner = (ownerId) => {
    const newSelection = selectedOwners.filter((so) => so.owner_id !== ownerId);
    // If we removed the primary, make the first remaining one primary
    if (newSelection.length > 0 && !newSelection.some((so) => so.is_primary)) {
      newSelection[0].is_primary = true;
    }
    onChange(newSelection);
  };

  // Handle setting primary owner
  const handleSetPrimary = (ownerId) => {
    const newSelection = selectedOwners.map((so) => ({
      ...so,
      is_primary: so.owner_id === ownerId,
    }));
    onChange(newSelection);
  };

  // Save new owner to database
  const handleSaveOwner = async (ownerData) => {
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('crm_owners')
        .insert({ ...ownerData, user_id: userId })
        .select()
        .single();

      if (error) throw error;

      // Refresh list
      await fetchOwners();

      // Auto-select the new owner
      const isPrimary = selectedOwners.length === 0;
      onChange([...selectedOwners, { owner_id: data.id, is_primary: isPrimary }]);

      return data;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header with label and add button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</h4>
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Selected owners display */}
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {selectedOwnersFull.length > 0 ? (
          selectedOwnersFull.map((owner) => (
            <OwnerBadge
              key={owner.id}
              owner={owner}
              isPrimary={owner.is_primary}
              onRemove={handleRemoveOwner}
              onSetPrimary={selectedOwnersFull.length > 1 ? handleSetPrimary : null}
            />
          ))
        ) : (
          <span className="text-gray-400 text-sm">No owners assigned</span>
        )}
      </div>

      {/* Dropdown to select from existing owners */}
      {availableOwners.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left text-sm flex items-center justify-between focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            <span className="text-gray-400">
              {isLoading ? 'Loading...' : 'Click to add or change owners...'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                {availableOwners.map((owner) => {
                  const isSelected = selectedIds.includes(owner.id);
                  return (
                    <button
                      key={owner.id}
                      type="button"
                      onClick={() => handleToggleOwner(owner.id)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0"
                        style={{ backgroundColor: owner.avatar_color || '#3B82F6' }}
                      >
                        {(owner.name || '?')[0].toUpperCase()}
                      </span>
                      <span className="text-gray-900 dark:text-white flex-1">{owner.name}</span>
                      {owner.email && (
                        <span className="text-gray-400 text-xs truncate max-w-[120px]">{owner.email}</span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />

                {/* Add New Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setIsModalOpen(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add New Owner
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Show add button inline if no owners exist yet */}
      {!isLoading && availableOwners.length === 0 && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 text-sm hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2 transition-colors"
        >
          <User className="w-4 h-4" />
          Create your first owner
        </button>
      )}

      {/* Add Owner Modal */}
      <AddOwnerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOwner}
        isSaving={isSaving}
      />
    </div>
  );
}
