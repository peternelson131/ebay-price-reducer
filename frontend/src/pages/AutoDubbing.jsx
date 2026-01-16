/**
 * AutoDubbing Component
 * 
 * Eleven Labs Video Dubbing Integration
 * Allows users to upload videos and get AI-powered dubbed versions
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Upload, 
  Film, 
  Globe, 
  Play, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Trash2,
  X,
  FileVideo,
  Loader
} from 'lucide-react';

// Supported target languages for dubbing
const TARGET_LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
];

// Supported video formats
const SUPPORTED_FORMATS = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// State enum for dubbing process
const DubbingState = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  ERROR: 'error'
};

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getExpiryWarning(createdAt, expiryDays = 7) {
  const created = new Date(createdAt);
  const expiry = new Date(created.getTime() + expiryDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
  
  if (daysLeft <= 0) return { text: 'Expired', urgent: true };
  if (daysLeft <= 2) return { text: `Expires in ${daysLeft}d`, urgent: true };
  return { text: `Expires in ${daysLeft}d`, urgent: false };
}

// Drop zone component
function DropZone({ onFileSelect, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [disabled, onFileSelect]);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
        transition-all duration-200
        ${isDragging 
          ? 'border-accent bg-accent/5 scale-[1.02]' 
          : 'border-theme hover:border-accent/50 hover:bg-theme-hover'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      
      <div className="flex flex-col items-center gap-4">
        <div className={`
          w-16 h-16 rounded-full flex items-center justify-center
          ${isDragging ? 'bg-accent/20' : 'bg-theme-hover'}
        `}>
          <Upload className={`w-8 h-8 ${isDragging ? 'text-accent' : 'text-theme-tertiary'}`} />
        </div>
        
        <div>
          <p className="text-theme-primary font-medium">
            {isDragging ? 'Drop your video here' : 'Drag & drop your video here'}
          </p>
          <p className="text-theme-tertiary text-sm mt-1">
            or click to browse
          </p>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-theme-tertiary">
          <span className="px-2 py-1 bg-theme-hover rounded">MP4</span>
          <span className="px-2 py-1 bg-theme-hover rounded">MOV</span>
          <span className="px-2 py-1 bg-theme-hover rounded">WebM</span>
          <span className="text-theme-tertiary">• Max 500MB</span>
        </div>
      </div>
    </div>
  );
}

// Selected file preview
function FilePreview({ file, onRemove }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-theme-surface rounded-lg border border-theme">
      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
        <FileVideo className="w-6 h-6 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-theme-primary font-medium truncate">{file.name}</p>
        <p className="text-theme-tertiary text-sm">{formatFileSize(file.size)}</p>
      </div>
      <button
        onClick={onRemove}
        className="p-2 text-theme-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

// Progress indicator
function ProgressBar({ progress, status }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-theme-secondary">{status}</span>
        <span className="text-theme-tertiary">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-2 bg-theme-hover rounded-full overflow-hidden">
        <div 
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Processing spinner
function ProcessingState({ message }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-theme-hover" />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-accent border-t-transparent animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-theme-primary font-medium">{message || 'Dubbing in progress...'}</p>
        <p className="text-theme-tertiary text-sm mt-1">This may take a few minutes</p>
      </div>
    </div>
  );
}

// Job history table
function JobHistory({ jobs, onDownload, onDelete, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-6 h-6 animate-spin text-theme-tertiary" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center py-8 text-theme-tertiary">
        <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No dubbing jobs yet</p>
        <p className="text-sm mt-1">Upload a video to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-theme">
            <th className="text-left py-3 px-4 text-xs font-medium text-theme-tertiary uppercase tracking-wider">File</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-theme-tertiary uppercase tracking-wider">Language</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-theme-tertiary uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-theme-tertiary uppercase tracking-wider">Created</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-theme-tertiary uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme">
          {jobs.map((job) => {
            const language = TARGET_LANGUAGES.find(l => l.code === job.target_language);
            const expiry = job.status === 'completed' ? getExpiryWarning(job.created_at) : null;
            
            return (
              <tr key={job.id} className="hover:bg-theme-hover transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <FileVideo className="w-5 h-5 text-theme-tertiary" />
                    <span className="text-theme-primary text-sm truncate max-w-[200px]">
                      {job.filename}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span>{language?.flag || '🌐'}</span>
                    <span className="text-theme-secondary text-sm">{language?.name || job.target_language}</span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-success/10 text-success">
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </span>
                        {expiry && (
                          <span className={`text-xs ${expiry.urgent ? 'text-warning' : 'text-theme-tertiary'}`}>
                            {expiry.text}
                          </span>
                        )}
                      </>
                    )}
                    {job.status === 'processing' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-accent/10 text-accent">
                        <Loader className="w-3 h-3 animate-spin" />
                        Processing
                      </span>
                    )}
                    {job.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-error/10 text-error">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                    {job.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-warning/10 text-warning">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-theme-tertiary text-sm">
                  {formatTimeAgo(job.created_at)}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    {job.status === 'completed' && job.download_url && (
                      <button
                        onClick={() => onDownload(job)}
                        className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title="Download dubbed video"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(job.id)}
                      className="p-2 text-theme-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Delete job"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AutoDubbing() {
  const { user } = useAuth();
  const [state, setState] = useState(DubbingState.IDLE);
  const [selectedFile, setSelectedFile] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [message, setMessage] = useState(null);
  
  const pollIntervalRef = useRef(null);

  // Load job history on mount
  useEffect(() => {
    if (user) {
      loadJobHistory();
    }
  }, [user]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadJobHistory = async () => {
    try {
      setLoadingJobs(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/dub-status?list=true', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to load job history:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleFileSelect = (file) => {
    setError(null);
    setMessage(null);

    // Validate file type
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      setError('Unsupported file format. Please use MP4, MOV, or WebM.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  const startDubbing = async () => {
    if (!selectedFile || !user) return;

    setState(DubbingState.UPLOADING);
    setUploadProgress(0);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Step 1: Upload video to Supabase Storage first
      const timestamp = Date.now();
      const ext = selectedFile.name.split('.').pop() || 'mp4';
      const storagePath = `${user.id}/source_${timestamp}.${ext}`;
      
      console.log('Uploading to Supabase Storage:', storagePath);
      
      const { error: uploadError } = await supabase.storage
        .from('dubbed-videos')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            setUploadProgress(percent * 0.9); // 90% for upload
          }
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(90);
      console.log('Upload complete, starting dubbing job...');

      // Step 2: Call dub-video with storage path
      const response = await fetch('/.netlify/functions/dub-video', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storagePath,
          targetLanguage,
          originalFilename: selectedFile.name
        })
      });

      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start dubbing');
      }

      const result = await response.json();
      
      // Start polling for status
      setCurrentJobId(result.jobId);
      setState(DubbingState.PROCESSING);
      startPolling(result.jobId, session.access_token);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload video');
      setState(DubbingState.ERROR);
    }
  };

  const startPolling = (jobId, accessToken) => {
    // Clear any existing poll
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`/.netlify/functions/dub-status?jobId=${jobId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) throw new Error('Failed to check status');

        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(pollIntervalRef.current);
          setState(DubbingState.COMPLETE);
          setMessage({ type: 'success', text: 'Dubbing complete! Your video is ready to download.' });
          
          // Auto-download
          if (data.downloadUrl) {
            triggerDownload(data.downloadUrl, selectedFile.name.replace(/\.[^.]+$/, `_${targetLanguage}.mp4`));
          }
          
          // Refresh job history
          loadJobHistory();
          
        } else if (data.status === 'failed') {
          clearInterval(pollIntervalRef.current);
          setError(data.error || 'Dubbing failed');
          setState(DubbingState.ERROR);
          loadJobHistory();
        }
        // Keep polling if still processing
      } catch (err) {
        console.error('Polling error:', err);
        // Don't stop polling on network errors, just log
      }
    };

    // Poll every 5 seconds
    pollIntervalRef.current = setInterval(poll, 5000);
    // Also poll immediately
    poll();
  };

  const triggerDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = (job) => {
    if (job.download_url) {
      triggerDownload(job.download_url, job.filename.replace(/\.[^.]+$/, `_${job.target_language}.mp4`));
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(`/.netlify/functions/dub-status?id=${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const resetForm = () => {
    setState(DubbingState.IDLE);
    setSelectedFile(null);
    setUploadProgress(0);
    setCurrentJobId(null);
    setError(null);
    setMessage(null);
  };

  const selectedLanguage = TARGET_LANGUAGES.find(l => l.code === targetLanguage);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-theme-primary">Auto-dubbing</h1>
        </div>
        <p className="text-theme-secondary">
          Upload a video and get an AI-powered dubbed version in your target language.
          Powered by Eleven Labs voice synthesis.
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-success/10 border-success/30 text-success' 
            : 'bg-error/10 border-error/30 text-error'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg border bg-error/10 border-error/30 text-error flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <span>{error}</span>
            <button 
              onClick={resetForm}
              className="ml-4 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Upload Card */}
      <div className="bg-theme-surface rounded-xl border border-theme p-6 mb-6">
        <h2 className="text-lg font-medium text-theme-primary mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Video
        </h2>

        {state === DubbingState.IDLE && (
          <>
            {!selectedFile ? (
              <DropZone onFileSelect={handleFileSelect} disabled={false} />
            ) : (
              <FilePreview file={selectedFile} onRemove={handleRemoveFile} />
            )}

            {/* Language Selection */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-theme-secondary mb-2">
                Target Language
              </label>
              <div className="flex items-center gap-4">
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
                >
                  {TARGET_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
                <div className="text-sm text-theme-tertiary">
                  Source: 🇺🇸 English
                </div>
              </div>
            </div>

            {/* Start Button */}
            <div className="mt-6">
              <button
                onClick={startDubbing}
                disabled={!selectedFile}
                className="w-full sm:w-auto px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Start Dubbing
              </button>
            </div>
          </>
        )}

        {state === DubbingState.UPLOADING && (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <FileVideo className="w-5 h-5 text-accent" />
              <span className="text-theme-primary">{selectedFile?.name}</span>
              <span className="text-theme-tertiary">→</span>
              <span>{selectedLanguage?.flag} {selectedLanguage?.name}</span>
            </div>
            <ProgressBar progress={uploadProgress} status="Uploading video..." />
          </div>
        )}

        {state === DubbingState.PROCESSING && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <FileVideo className="w-5 h-5 text-accent" />
              <span className="text-theme-primary">{selectedFile?.name}</span>
              <span className="text-theme-tertiary">→</span>
              <span>{selectedLanguage?.flag} {selectedLanguage?.name}</span>
            </div>
            <ProcessingState message="Dubbing in progress..." />
          </div>
        )}

        {state === DubbingState.COMPLETE && (
          <div className="py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <p className="text-theme-primary font-medium mb-2">Dubbing Complete!</p>
            <p className="text-theme-tertiary text-sm mb-4">Your video has been downloaded.</p>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              Dub Another Video
            </button>
          </div>
        )}

        {state === DubbingState.ERROR && (
          <div className="py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-error" />
            </div>
            <p className="text-theme-primary font-medium mb-2">Dubbing Failed</p>
            <p className="text-theme-tertiary text-sm mb-4">{error || 'Something went wrong'}</p>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Job History */}
      <div className="bg-theme-surface rounded-xl border border-theme p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-theme-primary flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Jobs
          </h2>
          <button
            onClick={loadJobHistory}
            className="p-2 text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        
        <JobHistory 
          jobs={jobs} 
          onDownload={handleDownload} 
          onDelete={handleDeleteJob}
          loading={loadingJobs}
        />
      </div>

      {/* Info Note */}
      <div className="mt-6 p-4 bg-accent/10 border border-accent/30 rounded-lg">
        <h3 className="font-medium text-accent flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          About Auto-dubbing
        </h3>
        <p className="mt-1 text-sm text-theme-secondary">
          Videos are processed using Eleven Labs AI voice synthesis. Processing time depends on video length.
          Dubbed videos are available for download for 7 days after completion.
        </p>
      </div>
    </div>
  );
}
