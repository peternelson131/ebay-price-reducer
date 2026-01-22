import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userAPI } from '../../lib/supabase';
import { Folder, ChevronRight, ChevronDown, RefreshCw, X, Check } from 'lucide-react';

/**
 * FolderPicker Component
 * Modal for browsing and selecting OneDrive folders
 */
export default function FolderPicker({ onClose, onSelect, skipSave = false }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async (folderId = null) => {
    try {
      setLoading(true);
      const token = await userAPI.getAuthToken();
      
      const url = new URL('/.netlify/functions/onedrive-folders', window.location.origin);
      if (folderId) {
        url.searchParams.append('folderId', folderId);
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch folders');
      }

      const data = await response.json();
      
      if (folderId) {
        // We're fetching children of a specific folder
        setFolders(prev => {
          const updated = [...prev];
          const updateChildren = (items) => {
            for (let item of items) {
              if (item.id === folderId) {
                item.children = data.folders || [];
                return true;
              }
              if (item.children && updateChildren(item.children)) {
                return true;
              }
            }
            return false;
          };
          updateChildren(updated);
          return updated;
        });
      } else {
        // Root level folders
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = async (folder) => {
    const newExpanded = new Set(expandedFolders);
    
    if (newExpanded.has(folder.id)) {
      newExpanded.delete(folder.id);
    } else {
      newExpanded.add(folder.id);
      
      // Fetch children if not already loaded
      if (!folder.children) {
        await fetchFolders(folder.id);
      }
    }
    
    setExpandedFolders(newExpanded);
  };

  const handleSelect = async () => {
    if (!selectedFolder) {
      toast.warning('Please select a folder');
      return;
    }

    setSaving(true);

    try {
      // If skipSave is true, just call onSelect without saving to default folder
      if (skipSave) {
        toast.success('Folder selected successfully');
        onSelect(selectedFolder);
        setSaving(false);
        return;
      }

      const token = await userAPI.getAuthToken();
      const response = await fetch('/.netlify/functions/onedrive-set-folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          folderId: selectedFolder.id,
          folderPath: selectedFolder.path
        })
      });

      if (!response.ok) {
        throw new Error('Failed to set folder');
      }

      const data = await response.json();

      if (data.success) {
        toast.success('Folder selected successfully');
        onSelect(selectedFolder);
      } else {
        throw new Error(data.error || 'Failed to set folder');
      }
    } catch (error) {
      console.error('Error setting folder:', error);
      toast.error(`Failed to select folder: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const renderFolder = (folder, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder?.id === folder.id;
    const hasChildren = folder.childCount > 0 || folder.children?.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center py-2 px-3 rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-ebay-blue text-white'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder);
              }}
              className="mr-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          
          {!hasChildren && <div className="w-5 mr-2" />}
          
          <div
            onClick={() => setSelectedFolder(folder)}
            className="flex items-center flex-1 min-w-0"
          >
            <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${isSelected ? 'text-white' : 'text-blue-500'}`} />
            <span className="text-sm truncate">{folder.name}</span>
          </div>

          {isSelected && (
            <Check className="w-4 h-4 ml-2 flex-shrink-0" />
          )}
        </div>

        {isExpanded && folder.children && (
          <div>
            {folder.children.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme">
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">
              Select OneDrive Folder
            </h3>
            <p className="text-sm text-theme-secondary mt-1">
              Choose where to store product videos
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && folders.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-ebay-blue" />
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-12">
              <Folder className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-theme-secondary">No folders found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map(folder => renderFolder(folder))}
            </div>
          )}
        </div>

        {/* Selected Folder Info */}
        {selectedFolder && (
          <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-theme">
            <p className="text-xs text-theme-tertiary">Selected:</p>
            <p className="text-sm font-medium text-theme-primary truncate">
              {selectedFolder.path || selectedFolder.name}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-theme">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedFolder || saving}
            className="px-6 py-2 text-sm bg-ebay-blue text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Selecting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Select Folder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
