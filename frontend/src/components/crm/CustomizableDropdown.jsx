/**
 * CustomizableDropdown Component
 * 
 * A reusable dropdown that fetches options from Supabase and allows 
 * users to add custom options with a "+" button.
 * 
 * Supports: crm_statuses, crm_collaboration_types, crm_contact_sources, crm_marketplaces
 */

import { useState, useEffect, useCallback } from 'react';
import { userAPI, supabase } from '../../lib/supabase';
import { Plus, X, Check, Loader, ChevronDown } from 'lucide-react';

// Predefined color options for status-type endpoints
const COLOR_OPTIONS = [
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Amber', value: '#fbbf24' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Gray', value: '#6B7280' },
];

// Endpoint configuration
const ENDPOINT_CONFIG = {
  crm_statuses: {
    hasColor: true,
    hasSortOrder: true,
    nameField: 'name',
    defaultColor: '#6B7280',
  },
  crm_collaboration_types: {
    hasColor: false,
    hasSortOrder: false,
    nameField: 'name',
  },
  crm_contact_sources: {
    hasColor: false,
    hasSortOrder: false,
    nameField: 'name',
  },
  crm_marketplaces: {
    hasColor: false,
    hasSortOrder: false,
    nameField: 'name',
  },
};

/**
 * Add Option Modal Component
 */
const AddOptionModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  endpoint,
  isSaving 
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#f97316');
  const [error, setError] = useState('');
  
  const config = ENDPOINT_CONFIG[endpoint] || {};
  
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
        color: config.hasColor ? color : undefined 
      });
      setName('');
      setColor('#f97316');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save option');
    }
  };
  
  const handleClose = () => {
    setName('');
    setColor('#f97316');
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
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add New Option
          </h3>
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
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter name..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
            
            {/* Color Picker (for status-type endpoints) */}
            {config.hasColor && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(({ name: colorName, value }) => (
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
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {name || 'New Status'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
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
              {isSaving ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * CustomizableDropdown Component
 * 
 * @param {object} props
 * @param {string} props.endpoint - Supabase table name (e.g., 'crm_statuses')
 * @param {string} [props.table] - Alias for endpoint (for compatibility)
 * @param {string} props.value - Current selected value (ID)
 * @param {function} props.onChange - Callback when value changes
 * @param {string} [props.label] - Label text
 * @param {string} [props.placeholder] - Placeholder text
 * @param {boolean} [props.allowEmpty] - Allow empty selection
 * @param {string} [props.emptyLabel] - Label for empty option
 * @param {boolean} [props.showColor] - Force show color indicator
 * @param {string} [props.className] - Additional CSS classes
 */
export default function CustomizableDropdown({
  endpoint,
  table,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  allowEmpty = true,
  emptyLabel = 'None',
  showColor,
  className = '',
}) {
  // Support both 'endpoint' and 'table' prop names
  const tableName = endpoint || table;
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const config = ENDPOINT_CONFIG[tableName] || {};
  // Allow showColor prop to override config
  const displayColor = showColor !== undefined ? showColor : config.hasColor;
  
  // Fetch options from Supabase
  const fetchOptions = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      // Query: get system defaults (user_id = NULL) and user's custom options
      let query = supabase.from(tableName).select('*');
      
      // Order by sort_order if available, otherwise by name
      if (config.hasSortOrder) {
        query = query.order('sort_order', { ascending: true });
      } else {
        query = query.order('name', { ascending: true });
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Filter to show system defaults (user_id = null) + user's custom options
      const filtered = (data || []).filter(item => 
        item.user_id === null || item.user_id === userId
      );
      
      setOptions(filtered);
    } catch (err) {
      console.error(`Error fetching ${tableName} options:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [tableName, config.hasSortOrder]);
  
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);
  
  // Save new option
  const handleSaveOption = async ({ name, color }) => {
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      if (!userId) {
        throw new Error('Not authenticated');
      }
      
      // Build insert data
      const insertData = {
        name,
        user_id: userId,
      };
      
      if (config.hasColor && color) {
        insertData.color = color;
      }
      
      if (config.hasSortOrder) {
        // Get max sort_order and add 1
        const maxSort = options.reduce((max, opt) => 
          Math.max(max, opt.sort_order || 0), 0
        );
        insertData.sort_order = maxSort + 1;
      }
      
      const { data, error } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Refresh options
      await fetchOptions();
      
      // Select the newly created option
      if (data?.id) {
        onChange(data.id);
      }
      
      return data;
    } finally {
      setIsSaving(false);
    }
  };
  
  // Get display value
  const selectedOption = options.find(opt => opt.id === value);
  const displayValue = selectedOption?.name || placeholder;
  
  return (
    <div className={`relative ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      
      {/* Custom Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left flex items-center justify-between focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        >
          <div className="flex items-center gap-2 truncate">
            {/* Color indicator for statuses */}
            {displayColor && selectedOption?.color && (
              <span 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedOption.color }}
              />
            )}
            <span className={!selectedOption ? 'text-gray-400' : ''}>
              {isLoading ? 'Loading...' : displayValue}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <>
            {/* Backdrop to close dropdown */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsDropdownOpen(false)}
            />
            
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
              {/* Empty option */}
              {allowEmpty && (
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    !value ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <span className="text-gray-400">{emptyLabel}</span>
                </button>
              )}
              
              {/* Options */}
              {options.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => { onChange(option.id); setIsDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                    value === option.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  {/* Color indicator */}
                  {displayColor && option.color && (
                    <span 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="text-gray-900 dark:text-white">{option.name}</span>
                  {/* Show badge if user-created */}
                  {option.user_id && (
                    <span className="ml-auto text-xs text-gray-400">Custom</span>
                  )}
                </button>
              ))}
              
              {/* Divider */}
              <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
              
              {/* Add Button */}
              <button
                type="button"
                onClick={() => { setIsDropdownOpen(false); setIsModalOpen(true); }}
                className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add New Option
              </button>
            </div>
          </>
        )}
      </div>
      
      {/* Add Option Modal */}
      <AddOptionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOption}
        endpoint={tableName}
        isSaving={isSaving}
      />
    </div>
  );
}

/**
 * Helper hook to load dropdown options externally
 */
export const useDropdownOptions = (endpoint) => {
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        
        const { data, error } = await supabase
          .from(endpoint)
          .select('*')
          .order('name', { ascending: true });
        
        if (error) throw error;
        
        const filtered = (data || []).filter(item => 
          item.user_id === null || item.user_id === userId
        );
        
        setOptions(filtered);
      } catch (err) {
        console.error(`Error fetching ${endpoint}:`, err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchOptions();
  }, [endpoint]);
  
  return { options, isLoading };
};
