import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';
import { userAPI } from '../../lib/supabase';
import { Upload, X, RefreshCw, CheckCircle, AlertCircle, Film, FileVideo } from 'lucide-react';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB max file size
const ACCEPTED_VIDEO_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-msvideo': ['.avi']
};

/**
 * VideoUploader Component
 * Handles chunked video uploads to OneDrive with progress tracking
 */
export default function VideoUploader({ productId, asin, onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError(null);
    setUploadComplete(false);

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.file.size > MAX_FILE_SIZE) {
        setError('File is too large. Maximum file size is 2GB.');
        toast.error('File is too large. Maximum file size is 2GB.');
      } else {
        setError('Invalid file type. Please upload a video file (MP4, MOV, WEBM, or AVI).');
        toast.error('Invalid file type. Please upload a video file.');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_VIDEO_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: uploading
  });

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const uploadChunked = async (file, uploadUrl, onProgress) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
          'Content-Type': 'application/octet-stream'
        },
        body: chunk
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks}: ${errorText}`);
      }

      const chunkProgress = ((i + 1) / totalChunks) * 100;
      onProgress(chunkProgress);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.warning('Please select a file to upload');
      return;
    }

    if (!productId) {
      toast.error('Product ID is required');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const token = await userAPI.getAuthToken();

      // Step 1: Create upload session
      // Generate filename based on ASIN if available, otherwise use original name
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const uploadFilename = asin ? `${asin}.${fileExtension}` : file.name;
      
      const sessionResponse = await fetch('/.netlify/functions/onedrive-upload-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId,
          filename: uploadFilename,  // Use ASIN-based filename
          fileSize: file.size
        })
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        
        if (errorData.error === 'OneDrive not connected') {
          throw new Error('OneDrive not connected. Please connect your OneDrive account in Settings.');
        }
        
        throw new Error(errorData.error || 'Failed to create upload session');
      }

      const sessionData = await sessionResponse.json();

      if (!sessionData.uploadUrl) {
        throw new Error('No upload URL received');
      }

      // Step 2: Upload file in chunks
      await uploadChunked(file, sessionData.uploadUrl, setProgress);

      // Step 3: Save video metadata
      const metadataResponse = await fetch('/.netlify/functions/videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId,
          filename: uploadFilename,  // Use ASIN-based filename
          fileSize: file.size,
          oneDriveId: sessionData.oneDriveId,
          oneDrivePath: sessionData.oneDrivePath,
          originalFilename: file.name  // Keep original for reference
        })
      });

      if (!metadataResponse.ok) {
        throw new Error('Failed to save video metadata');
      }

      setUploadComplete(true);
      setProgress(100);
      toast.success('Video uploaded successfully!');

      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete();
      }

      // Reset after a delay
      setTimeout(() => {
        setFile(null);
        setUploadComplete(false);
        setProgress(0);
      }, 3000);

    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setProgress(0);
    setError(null);
    setUploadComplete(false);
  };

  const handleRetry = () => {
    setError(null);
    handleUpload();
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      {!file && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragActive
              ? 'border-ebay-blue bg-blue-50 dark:bg-blue-900/20'
              : 'border-theme-border hover:border-ebay-blue dark:hover:border-blue-600'
          } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          
          <div className="flex flex-col items-center space-y-3">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
              <Film className={`w-8 h-8 ${isDragActive ? 'text-ebay-blue' : 'text-gray-400'}`} />
            </div>
            
            {isDragActive ? (
              <p className="text-sm text-ebay-blue font-medium">Drop video here...</p>
            ) : (
              <>
                <p className="text-sm font-medium text-theme-primary">
                  Drop video file here or click to browse
                </p>
                <p className="text-xs text-theme-tertiary">
                  Supports MP4, MOV, WEBM, AVI (max 2GB)
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* File Preview & Upload */}
      {file && (
        <div className="border border-theme rounded-lg p-4 space-y-4">
          {/* File Info */}
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                <FileVideo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-theme-primary truncate">
                  {file.name}
                </p>
                <p className="text-xs text-theme-tertiary mt-1">
                  {formatFileSize(file.size)}
                </p>
              </div>
            </div>

            {!uploading && !uploadComplete && (
              <button
                onClick={handleCancel}
                className="text-theme-tertiary hover:text-theme-primary transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-theme-secondary">Uploading...</span>
                <span className="text-theme-primary font-medium">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-ebay-blue h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success State */}
          {uploadComplete && (
            <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Upload complete!</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="space-y-3">
              <div className="flex items-start space-x-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Upload failed</p>
                  <p className="text-xs mt-1 break-words">{error}</p>
                </div>
              </div>
              <button
                onClick={handleRetry}
                className="w-full btn-secondary flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Upload
              </button>
            </div>
          )}

          {/* Upload Button */}
          {!uploading && !uploadComplete && !error && (
            <button
              onClick={handleUpload}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Video
            </button>
          )}
        </div>
      )}
    </div>
  );
}
