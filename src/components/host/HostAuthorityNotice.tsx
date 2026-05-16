import { ShieldAlert } from 'lucide-react';
import './HostAuthorityNotice.css';

interface HostAuthorityNoticeProps {
  id: string;
}

export default function HostAuthorityNotice({ id }: HostAuthorityNoticeProps) {
  return (
    <div
      id={id}
      className="host-authority-notice"
      role="status"
      aria-live="polite"
      data-testid="host-authority-warning"
    >
      <ShieldAlert size={16} color="#8A4E00" aria-hidden="true" />
      <div>
        <div className="host-authority-notice__title">Host controls unavailable</div>
        <div className="host-authority-notice__text">
          Open the original host browser session for this room. AI and settlement controls require host authority.
        </div>
      </div>
    </div>
  );
}
