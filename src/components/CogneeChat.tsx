import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { useCogneeChat } from '../hooks/useCogneeChat';
import type { Market, ActivityEntry, PlayerData, ChatMessage } from '../types';

interface CogneeChatProps {
  propertyId: string;
  askingPrice: number;
  market: Market | null;
  activity: ActivityEntry[];
  players: PlayerData[];
}

const STARTERS = [
  { label: 'Analyze all bets', query: 'Analyze all the bets placed so far and identify patterns in betting behavior.', icon: <BarChart3 size={13} /> },
  { label: 'Suggest a bet', query: 'Based on the current market state and betting patterns, suggest whether I should bet OVER or UNDER and how much to wager.', icon: <TrendingUp size={13} /> },
  { label: 'Market summary', query: 'Give me a summary of this market including the current probability, volume, and fair value assessment.', icon: <DollarSign size={13} /> },
];

export default function CogneeChat({ propertyId, askingPrice, market, activity, players }: CogneeChatProps) {
  const { messages, isLoading, isInitializing, sendMessage } = useCogneeChat({
    propertyId, askingPrice, market, activity, players,
  });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isLoading) return;
    setInput('');
    sendMessage(q);
  };

  return (
    <div style={s.card}>
      <div style={s.title}>
        <Sparkles size={14} color="var(--accent-primary)" /> AI Analyst
      </div>

      {/* Starter chips */}
      {messages.length === 0 && !isLoading && (
        <div style={s.starters}>
          {STARTERS.map((st) => (
            <button
              key={st.label}
              style={s.chip}
              onClick={() => sendMessage(st.query)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {st.icon} {st.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {(messages.length > 0 || isLoading) && (
        <div style={s.messages}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {isLoading && (
            <div style={s.loading}>
              <Sparkles size={12} color="var(--accent-primary)" />
              <span style={s.loadingText}>
                {isInitializing ? 'Setting up AI...' : 'Thinking...'}
              </span>
              <span style={s.dots}>
                <span style={{ ...s.dot, animationDelay: '-0.32s' }} />
                <span style={{ ...s.dot, animationDelay: '-0.16s' }} />
                <span style={s.dot} />
              </span>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      )}

      {/* Input */}
      <div style={s.inputRow}>
        <input
          style={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about this market..."
          disabled={isLoading}
        />
        <button
          style={{ ...s.sendBtn, opacity: isLoading || !input.trim() ? 0.5 : 1 }}
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          <Send size={14} />
        </button>
      </div>

      {/* Inline keyframes for pulsing dots */}
      <style>{`
        @keyframes cogneePulse {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isError = msg.isError;

  return (
    <div style={{ ...s.bubble, alignSelf: isUser ? 'flex-end' : 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <Sparkles size={12} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 8 }} />}
      <div
        style={{
          ...(isUser ? s.bubbleUser : isError ? s.bubbleError : s.bubbleAssistant),
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    padding: 16,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  starters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 980,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  messages: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 420,
    overflowY: 'auto',
    marginBottom: 10,
    paddingRight: 4,
  },
  bubble: {
    display: 'flex',
    gap: 8,
    maxWidth: '88%',
  },
  bubbleUser: {
    background: 'var(--accent-primary)',
    color: '#fff',
    borderRadius: '12px 12px 4px 12px',
    padding: '8px 14px',
    fontSize: 13,
    lineHeight: 1.5,
  },
  bubbleAssistant: {
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: '12px 12px 12px 4px',
    padding: '8px 14px',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-line',
  },
  bubbleError: {
    background: 'rgba(255, 59, 48, 0.08)',
    color: 'var(--accent-danger)',
    borderRadius: 12,
    padding: '8px 14px',
    fontSize: 12,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0',
  },
  loadingText: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  dots: {
    display: 'inline-flex',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    animation: 'cogneePulse 1.4s infinite ease-in-out both',
  },
  inputRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  },
  sendBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    flexShrink: 0,
  },
};
