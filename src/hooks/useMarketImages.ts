import { useState, useEffect, useRef, useCallback } from 'react';

const DB_NAME = 'fairvalue';
const DB_VERSION = 1;
const STORE_NAME = 'marketImages';

export function useMarketImages(marketIds: string[]) {
  const [ready, setReady] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const dbRef = useRef<IDBDatabase | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const loadImageFromDB = useCallback((marketId: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (!dbRef.current) return resolve(null);
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
  }, []);

  const loadAllImages = useCallback(async () => {
    if (!dbRef.current || !marketIds.length) {
      setReady(true);
      return;
    }

    const urls: Record<string, string> = {};

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
  }, [marketIds, loadImageFromDB]);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB');
      setReady(true);
    };

    request.onsuccess = () => {
      dbRef.current = request.result;
      loadAllImages();
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'marketId' });
      }
    };

    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getImageUrl = useCallback(
    (marketId: string): string | null => imageUrls[marketId] || null,
    [imageUrls]
  );

  const setImageFile = useCallback(
    async (marketId: string, file: File): Promise<void> => {
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

      if (imageUrls[marketId]) {
        URL.revokeObjectURL(imageUrls[marketId]);
        objectUrlsRef.current.delete(imageUrls[marketId]);
      }

      return new Promise<void>((resolve, reject) => {
        const transaction = dbRef.current!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ marketId, blob: file, uploadedAt: Date.now() });

        request.onsuccess = () => {
          const url = URL.createObjectURL(file);
          objectUrlsRef.current.add(url);
          setImageUrls((prev) => ({ ...prev, [marketId]: url }));
          resolve();
        };

        request.onerror = () => reject(request.error);
      });
    },
    [imageUrls]
  );

  const removeImage = useCallback(
    async (marketId: string): Promise<void> => {
      if (!dbRef.current) {
        throw new Error('Database not ready');
      }

      if (imageUrls[marketId]) {
        URL.revokeObjectURL(imageUrls[marketId]);
        objectUrlsRef.current.delete(imageUrls[marketId]);
      }

      return new Promise<void>((resolve, reject) => {
        const transaction = dbRef.current!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(marketId);

        request.onsuccess = () => {
          setImageUrls((prev) => {
            const newUrls = { ...prev };
            delete newUrls[marketId];
            return newUrls;
          });
          resolve();
        };

        request.onerror = () => reject(request.error);
      });
    },
    [imageUrls]
  );

  return { ready, getImageUrl, setImageFile, removeImage };
}
