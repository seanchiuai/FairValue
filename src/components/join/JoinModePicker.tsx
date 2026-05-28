import { LogIn, Plus, WandSparkles } from 'lucide-react';
import './JoinModePicker.css';

export type JoinModePickerMode = 'create' | 'join' | 'studio';

interface JoinModePickerProps {
  onSelect: (mode: JoinModePickerMode) => void;
}

export default function JoinModePicker({ onSelect }: JoinModePickerProps) {
  return (
    <div className="join-mode-picker">
      <button className="join-mode-picker__button" onClick={() => onSelect('create')}>
        <Plus size={24} />
        <span className="join-mode-picker__label">Create Room</span>
        <span className="join-mode-picker__description">Host a game on TV/projector</span>
      </button>
      <button className="join-mode-picker__button" onClick={() => onSelect('studio')}>
        <WandSparkles size={24} />
        <span className="join-mode-picker__label">Market Studio</span>
        <span className="join-mode-picker__description">Generate a room from pasted listing text</span>
      </button>
      <button className="join-mode-picker__button" onClick={() => onSelect('join')}>
        <LogIn size={24} />
        <span className="join-mode-picker__label">Join Room</span>
        <span className="join-mode-picker__description">Play from your phone</span>
      </button>
    </div>
  );
}
