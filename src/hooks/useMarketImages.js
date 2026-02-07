import { useState, useEffect, useRef, useCallback } from 'react';

const DB_NAME = 'fairvalue';
const DB_VERSION = 1;
const STORE_NAME = 'marketImages';

export function useMarketImages(marketIds) {
  const [ready, setReady] = useState(false);
  const [imageUrls, setImageUrls] = useState({});
  const dbRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  // Initialize IndexedDB
  useEffect(() => {
    const initDB = async () => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
          console.error('Failed to open IndexedDB');
          setReady(true);
        };
        
        request.onsuccess = (event) => {
          dbRef.current = event.target.result;
          loadAllImages();
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'marketId' });
          }
        };
      } catch (error) {
        console.error('IndexedDB init error:', error);
        setReady(true);
      }
    };

    initDB();

    // Cleanup object URLs on unmount
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  // Load images for all market IDs
  const loadAllImages = useCallback(async () => {
    if (!dbRef.current || !marketIds.length) {
      setReady(true);
      return;
    }

    const urls = {};
    
    for (const marketId of marketIds) {
      try {
        const url = await loadImageFromDB(marketId);
        if (url) {
          urls[marketId] = url;
        }
      } catch (error) {
        console.error(`Failed to load image for ${marketId}:`, error);
      }
    }

    setImageUrls(urls);
    setReady(true);
  }, [marketIds]);

  // Load single image from IndexedDB
  const loadImageFromDB = (marketId) => {
    return new Promise((resolve, reject) => {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(marketId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.blob) {
          const url = URL.createObjectURL(result.blob);
          objectUrlsRef.current.add(url);
          resolve(url);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  };

  // Get image URL for a specific market
  const getImageUrl = useCallback((marketId) => {
    return imageUrls[marketId] || null;
  }, [imageUrls]);

  // Validate and store image file
  const setImageFile = useCallback(async (marketId, file) => {
    // Validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      throw new Error('Invalid file type. Please upload JPG, PNG, or WebP.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 5MB.');
    }

    if (!dbRef.current) {
      throw new Error('Database not ready');
    }

    // Revoke old URL if exists
    if (imageUrls[marketId]) {
      URL.revokeObjectURL(imageUrls[marketId]);
      objectUrlsRef.current.delete(imageUrls[marketId]);
    }

    // Store in IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data = {
        marketId,
        blob: file,
        uploadedAt: Date.now()
      };
      
      const request = store.put(data);

      request.onsuccess = async () => {
        // Create new object URL
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.add(url);
        
        setImageUrls(prev => ({
          ...prev,
          [marketId]: url
        }));
        
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }, [imageUrls]);

  // Remove image
  const removeImage = useCallback(async (marketId) => {
    if (!dbRef.current) {
      throw new Error('Database not ready');
    }

    // Revoke object URL
    if (imageUrls[marketId]) {
      URL.revokeObjectURL(imageUrls[marketId]);
      objectUrlsRef.current.delete(imageUrls[marketId]);
    }

    // Remove from IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(marketId);

      request.onsuccess = () => {
        setImageUrls(prev => {
          const newUrls = { ...prev };
          delete newUrls[marketId];
          return newUrls;
        });
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }, [imageUrls]);

  return {
    ready,
    getImageUrl,
    setImageFile,
    removeImage
  };
}
