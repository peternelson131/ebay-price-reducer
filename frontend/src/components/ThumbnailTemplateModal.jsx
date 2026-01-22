import { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import ThumbnailZoneEditor from './ThumbnailZoneEditor';

/**
 * ThumbnailTemplateModal Component
 * Modal for uploading and configuring thumbnail templates
 * 
 * Features:
 * - Owner name input
 * - Drag & drop image upload
 * - Image preview
 * - Triggers zone editor after upload
 */
export default function ThumbnailTemplateModal({ 
  existingTemplate = null, 
  onClose, 
  onSave 
}) {
  const [ownerName, setOwnerName] = useState(existingTemplate?.owner_name || '');
  const [templateImage, setTemplateImage] = useState(existingTemplate?.template_url || null);
  const [imagePreview, setImagePreview] = useState(existingTemplate?.template_url || null);
  const [showZoneEditor, setShowZoneEditor] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    // Read file as data URL
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setTemplateImage(dataUrl);
      setImagePreview(dataUrl);
    };

    reader.onerror = () => {
      toast.error('Failed to read image file');
    };

    reader.readAsDataURL(file);
  };

  const handleContinue = () => {
    // Validate inputs
    if (!ownerName.trim()) {
      toast.error('Please enter an owner name');
      return;
    }

    if (!templateImage) {
      toast.error('Please upload a template image');
      return;
    }

    // Show zone editor
    setShowZoneEditor(true);
  };

  const handleZoneSave = (zone) => {
    // Call the parent's onSave with all template data
    onSave({
      owner_name: ownerName.trim(),
      template_image: templateImage,
      placement_zone: zone,
      id: existingTemplate?.id
    });
  };

  const handleRemoveImage = () => {
    setTemplateImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (showZoneEditor) {
    return (
      <ThumbnailZoneEditor
        templateImage={templateImage}
        initialZone={existingTemplate?.placement_zone}
        onSave={handleZoneSave}
        onCancel={() => setShowZoneEditor(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-surface rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme">
          <h2 className="text-xl font-semibold text-theme-primary">
            {existingTemplate ? 'Edit Template' : 'Add Thumbnail Template'}
          </h2>
          <button
            onClick={onClose}
            className="text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Owner Name Input */}
          <div className="form-group">
            <label className="form-label">Owner Name</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g., Peter, Sarah, John"
              className="form-input"
              autoFocus
            />
            <p className="text-xs text-theme-tertiary mt-1">
              Each owner can have one template. This will be used to automatically generate thumbnails.
            </p>
          </div>

          {/* Image Upload */}
          <div className="form-group">
            <label className="form-label">Template Image</label>
            
            {!imagePreview ? (
              <>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-accent bg-accent/10'
                      : 'border-theme hover:border-accent/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-theme-primary rounded-full">
                      <Upload className="text-theme-tertiary" size={32} />
                    </div>
                    <div>
                      <p className="text-theme-primary font-medium">
                        Drop your template image here
                      </p>
                      <p className="text-sm text-theme-tertiary mt-1">
                        or click to browse
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary mt-2"
                    >
                      <ImageIcon size={18} className="mr-2" />
                      Choose File
                    </button>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <p className="text-xs text-theme-tertiary mt-2">
                  Recommended: 1280x720px (16:9 aspect ratio). Max 5MB. PNG or JPG.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="relative border border-theme rounded-lg overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="Template preview"
                    className="w-full h-auto"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                    title="Remove image"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="text-xs text-theme-secondary">
                  ✓ Image uploaded. Click "Continue" to define the product placement zone.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-theme">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleContinue} 
            className="btn-primary"
            disabled={!ownerName.trim() || !templateImage}
          >
            Continue to Zone Editor
          </button>
        </div>
      </div>
    </div>
  );
}
