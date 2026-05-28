import { useEffect, useState } from 'react';
import type { PublicVerificationArtifact } from '../types';

type VerificationResponse = PublicVerificationArtifact & {
  error?: string;
};

export function usePublicVerificationArtifact(roomCode: string | undefined, enabled: boolean) {
  const [artifact, setArtifact] = useState<PublicVerificationArtifact | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomCode || !enabled) {
      setArtifact(null);
      setError('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setArtifact(null);
    setError('');
    setLoading(true);

    fetch(`/api/rooms/${roomCode}/public-verification`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({} as VerificationResponse));
        if (!response.ok || data.error) {
          setError(data.error || 'Public verification unavailable');
          return;
        }
        setArtifact(data as PublicVerificationArtifact);
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== 'AbortError') {
          setError('Public verification unavailable');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [roomCode, enabled]);

  return { artifact, error, loading };
}
