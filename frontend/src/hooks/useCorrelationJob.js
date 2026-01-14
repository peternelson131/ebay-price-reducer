/**
 * useCorrelationJob - React hook for ASIN correlation with background processing
 * 
 * Handles the full flow:
 * 1. Start background job
 * 2. Subscribe to realtime updates OR poll for status
 * 3. Return progress and final results
 * 
 * Usage:
 * const { 
 *   startJob, 
 *   job, 
 *   correlations, 
 *   isLoading, 
 *   error 
 * } = useCorrelationJob();
 * 
 * // Start processing
 * await startJob('B0123456789');
 * 
 * // job updates automatically via realtime or polling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import apiService from '../services/api';

export function useCorrelationJob(options = {}) {
  const {
    useRealtime = true,  // Use Supabase realtime if true, polling if false
    pollIntervalMs = 2000,
  } = options;

  const [job, setJob] = useState(null);
  const [correlations, setCorrelations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const subscriptionRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Subscribe to job updates via Supabase realtime
  const subscribeToJob = useCallback((jobId) => {
    if (!useRealtime) return;

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          const updatedJob = payload.new;
          setJob({
            id: updatedJob.id,
            asin: updatedJob.search_asin,
            status: updatedJob.status,
            totalCount: updatedJob.total_count,
            processedCount: updatedJob.processed_count,
            approvedCount: updatedJob.approved_count,
            rejectedCount: updatedJob.rejected_count,
            errorMessage: updatedJob.error_message,
            createdAt: updatedJob.created_at,
            completedAt: updatedJob.completed_at
          });

          // If complete, fetch correlations and stop listening
          if (updatedJob.status === 'complete' || updatedJob.status === 'error') {
            setIsLoading(false);
            if (updatedJob.status === 'complete') {
              fetchCorrelations(updatedJob.search_asin);
            }
            cleanup();
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;
  }, [useRealtime, cleanup]);

  // Poll for job updates (fallback if realtime not available)
  const startPolling = useCallback((jobId) => {
    if (useRealtime) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await apiService.getCorrelationJobStatus(jobId);
        
        if (result.job) {
          setJob(result.job);
        }

        if (result.isComplete) {
          setIsLoading(false);
          if (result.correlations) {
            setCorrelations(result.correlations);
          }
          cleanup();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, pollIntervalMs);
  }, [useRealtime, pollIntervalMs, cleanup]);

  // Fetch correlations from database
  const fetchCorrelations = useCallback(async (asin) => {
    try {
      const result = await apiService.checkAsinCorrelation(asin);
      if (result.correlations) {
        setCorrelations(result.correlations);
      }
    } catch (err) {
      console.error('Failed to fetch correlations:', err);
    }
  }, []);

  // Start a new correlation job
  const startJob = useCallback(async (asin) => {
    cleanup();
    setError(null);
    setIsLoading(true);
    setCorrelations([]);
    setJob(null);

    try {
      const result = await apiService.startCorrelationJob(asin);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start job');
      }

      const jobId = result.jobId;
      
      // Set initial job state
      setJob({
        id: jobId,
        asin: asin.toUpperCase(),
        status: result.alreadyRunning ? result.status : 'pending',
        totalCount: 0,
        processedCount: 0,
        approvedCount: 0,
        rejectedCount: 0
      });

      // Start listening for updates
      if (useRealtime) {
        subscribeToJob(jobId);
      } else {
        startPolling(jobId);
      }

      return { success: true, jobId };

    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      return { success: false, error: err.message };
    }
  }, [cleanup, useRealtime, subscribeToJob, startPolling]);

  // Check job status (manual)
  const checkStatus = useCallback(async (jobId) => {
    try {
      const result = await apiService.getCorrelationJobStatus(jobId);
      if (result.job) {
        setJob(result.job);
      }
      if (result.correlations) {
        setCorrelations(result.correlations);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Progress percentage
  const progress = job?.totalCount > 0 
    ? Math.round((job.processedCount / job.totalCount) * 100)
    : 0;

  return {
    // Actions
    startJob,
    checkStatus,
    cleanup,
    
    // State
    job,
    correlations,
    isLoading,
    error,
    progress,
    
    // Computed
    isComplete: job?.status === 'complete',
    hasError: job?.status === 'error' || !!error,
  };
}

export default useCorrelationJob;
