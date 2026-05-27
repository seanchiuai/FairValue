import { useCallback, useEffect, useState } from 'react';
import { buildUserAuthHeaders } from '../lib/fairValueAuth';
import type { UserReputation } from '../types';

type ReputationResponse = Partial<UserReputation> & {
  error?: string;
};

async function readReputationResponse(response: Response): Promise<ReputationResponse> {
  return response.json().catch(() => ({}));
}

function isUserReputation(value: ReputationResponse): value is UserReputation {
  return (
    value.schema_version === 'fairvalue.userReputation.v1' &&
    typeof value.user_id === 'string' &&
    typeof value.rooms_played === 'number' &&
    Array.isArray(value.recent_rooms)
  );
}

export function useUserReputation(userToken: string) {
  const [reputation, setReputation] = useState<UserReputation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userToken) {
      setReputation(null);
      setLoading(false);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/me/reputation', {
        headers: buildUserAuthHeaders(userToken),
      });
      const data = await readReputationResponse(response);
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Reputation unavailable');
      }
      if (!isUserReputation(data)) {
        throw new Error('Reputation response was invalid');
      }
      setReputation(data);
      return data;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Reputation unavailable';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    reputation,
    reputationLoading: loading,
    reputationError: error,
    refreshReputation: refresh,
  };
}
