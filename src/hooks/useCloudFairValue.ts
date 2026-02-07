import { useState, useEffect, useRef, useCallback } from 'react';
import { cloudPersistence } from '../services/cloudPersistence';

// Constants for cloud sync
const SYNC_INTERVAL = 3000; // Sync every 3 seconds
const COGNEE_API_URL = process.env.REACT_APP_COGNEE_API_URL || 'https://api.fairvalue.io/v1';

interface FairValueUpdate {
  marketId: string;
  fairValue: number;
}

interface CloudData {
  fairValues: Record<string, number>;
  timestamp: number;
}

export function useCloudFairValue(marketIds: string[]) {
  const [fairValues, setFairValues] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const pendingUpdates = useRef<Map<string, number>>(new Map());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastCleanupRef = useRef<(() => void) | null>(null);

  // Initialize and sync with cloud
  useEffect(() => {
    const initCloudSync = async () => {
      try {
        // Load initial fair values from cloud
        await syncFromCloud();
        setReady(true);
      } catch (error) {
        console.error('Failed to initialize cloud sync:', error);
        setReady(true);
      }
    };

    initCloudSync();

    // Set up online/offline detection
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start periodic sync
    syncIntervalRef.current = setInterval(() => {
      if (isOnline && pendingUpdates.current.size > 0) {
        syncPendingUpdates();
      }
      syncFromCloud();
    }, SYNC_INTERVAL);

    // Listen for updates from other tabs/users
    broadcastCleanupRef.current = cloudPersistence.listenForUpdates(
      (marketId: string, fairValue: number) => {
        setFairValues(prev => ({
          ...prev,
          [marketId]: fairValue
        }));
      }
    );

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (broadcastCleanupRef.current) {
        broadcastCleanupRef.current();
      }
    };
  }, [marketIds, isOnline]);

  // Sync fair values from cloud
  const syncFromCloud = useCallback(async () => {
    try {
      // For demo purposes, using a mock API endpoint
      // In production, replace with actual Cognee or your backend API
      const response = await fetch(`${COGNEE_API_URL}/markets/fairvalues`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add cache-busting to always get fresh data
        cache: 'no-cache'
      }).catch(() => null);

      if (response && response.ok) {
        const data = await response.json();
        if (data && data.fairValues) {
          setFairValues(prev => ({
            ...prev,
            ...data.fairValues
          }));
        }
      } else {
        // Fallback: Load from localStorage for persistence
        loadFromLocalStorage();
      }
    } catch (error) {
      console.error('Error syncing from cloud:', error);
      loadFromLocalStorage();
    }
  }, []);

  // Load from localStorage as fallback
  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem('fairvalue_cloud_data');
      if (stored) {
        const data: CloudData = JSON.parse(stored);
        if (data.fairValues && Date.now() - data.timestamp < 86400000) { // 24h expiry
          setFairValues(prev => ({
            ...prev,
            ...data.fairValues
          }));
        }
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  };

  // Save to localStorage as backup
  const saveToLocalStorage = (values: Record<string, number>) => {
    try {
      localStorage.setItem('fairvalue_cloud_data', JSON.stringify({
        fairValues: values,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  // Sync pending updates to cloud
  const syncPendingUpdates = async () => {
    if (pendingUpdates.current.size === 0) return;

    const updates = Array.from(pendingUpdates.current.entries());
    
    for (const [marketId, fairValue] of updates) {
      try {
        await updateCloudFairValue(marketId, fairValue);
        pendingUpdates.current.delete(marketId);
      } catch (error) {
        console.error(`Failed to sync ${marketId}:`, error);
      }
    }
  };

  // Update fair value in cloud
  const updateCloudFairValue = async (marketId: string, fairValue: number) => {
    try {
      const response = await fetch(`${COGNEE_API_URL}/markets/${marketId}/fairvalue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          marketId,
          fairValue,
          timestamp: Date.now(),
          userId: 'anonymous' // Could be actual user ID
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating cloud fair value:', error);
      throw error;
    }
  };

  // Get fair value for a specific market
  const getFairValue = useCallback((marketId: string): number | null => {
    return fairValues[marketId] || null;
  }, [fairValues]);

  // Update fair value (queues for cloud sync)
  const updateFairValue = useCallback(async (marketId: string, fairValue: number) => {
    // Update local state immediately for responsiveness
    setFairValues(prev => {
      const updated = {
        ...prev,
        [marketId]: fairValue
      };
      saveToLocalStorage(updated);
      return updated;
    });

    // Queue for cloud sync
    pendingUpdates.current.set(marketId, fairValue);

    // Try immediate cloud update if online
    if (isOnline) {
      try {
        await updateCloudFairValue(marketId, fairValue);
        pendingUpdates.current.delete(marketId);
      } catch (error) {
        console.error('Immediate cloud update failed, queued for retry:', error);
      }
    }
  }, [isOnline]);

  // Batch update multiple fair values
  const batchUpdateFairValues = useCallback(async (updates: FairValueUpdate[]) => {
    // Update local state
    setFairValues(prev => {
      const updated = { ...prev };
      updates.forEach(({ marketId, fairValue }) => {
        updated[marketId] = fairValue;
      });
      saveToLocalStorage(updated);
      return updated;
    });

    // Queue all for cloud sync
    updates.forEach(({ marketId, fairValue }) => {
      pendingUpdates.current.set(marketId, fairValue);
    });

    // Sync to cloud if online
    if (isOnline) {
      await syncPendingUpdates();
    }
  }, [isOnline]);

  return {
    ready,
    isOnline,
    getFairValue,
    updateFairValue,
    batchUpdateFairValues,
    pendingCount: pendingUpdates.current.size
  };
}

export default useCloudFairValue;
