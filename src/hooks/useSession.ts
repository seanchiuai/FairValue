import { useState, useCallback } from 'react';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useSession() {
  const [sessionId] = useState<string>(() => {
    let id = sessionStorage.getItem('fv_session_id');
    if (!id) {
      id = generateUUID();
      sessionStorage.setItem('fv_session_id', id);
    }
    return id;
  });

  const [nickname, setNicknameState] = useState<string>(
    () => sessionStorage.getItem('fv_nickname') || ''
  );

  const saveNickname = useCallback((name: string) => {
    sessionStorage.setItem('fv_nickname', name);
    setNicknameState(name);
  }, []);

  return { sessionId, nickname, saveNickname };
}
