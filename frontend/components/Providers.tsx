'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider';
import EmotionRegistry from './EmotionRegistry';
import type { ChatMessage } from '@/lib/types';

// ── Dark mode ────────────────────────────────────────────────────────────────

interface DarkModeContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextValue>({
  darkMode: true,
  toggleDarkMode: () => {},
});

export const useDarkMode = () => useContext(DarkModeContext);

// ── Trading events (SSE change stream) ───────────────────────────────────────
// Kept at the provider level so the connection survives page navigation.
// The telemetry page reads from this context and applies its own filters
// client-side, avoiding a reconnect on every tab switch.

export interface TradingEvent {
  streamId: string;
  streamType: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: { source: string; schemaVersion: number };
}

interface TradingEventsContextValue {
  events: TradingEvent[];
  connected: boolean;
}

const TradingEventsContext = createContext<TradingEventsContextValue>({
  events: [],
  connected: false,
});

export const useTradingEvents = () => useContext(TradingEventsContext);

function TradingEventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<TradingEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);
  const streamBaseRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>('default');

  useEffect(() => {
    disposedRef.current = false;
    const stored = localStorage.getItem('leafy_session_id');
    if (stored) {
      sessionIdRef.current = stored;
    } else {
      const id = `session-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem('leafy_session_id', id);
      sessionIdRef.current = id;
    }

    const connect = async () => {
      if (disposedRef.current) return;

      // Resolve external stream URL once, then cache it for reconnects.
      if (streamBaseRef.current === null) {
        try {
          const cfg = await fetch('/api/stream-config');
          const data = await cfg.json();
          streamBaseRef.current = typeof data.streamUrl === 'string' ? data.streamUrl : '';
        } catch {
          streamBaseRef.current = '';
        }
      }

      const url = `${streamBaseRef.current}/api/trading/events/stream?session_id=${sessionIdRef.current}`;

      // Use EventSource (native SSE) instead of fetch(). EventSource uses
      // HTTP/1.1 which avoids Envoy/Istio HTTP/2 response buffering that
      // causes fetch()-based SSE to hang indefinitely.
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (evt) => {
        try {
          const doc = JSON.parse(evt.data);
          if (doc.type === 'ping' || doc.type === 'error') return;
          const event: TradingEvent = {
            streamId: doc.streamId ?? 'UNKNOWN',
            streamType: doc.streamType ?? 'Unknown',
            eventType: doc.eventType,
            timestamp: doc.timestamp,
            payload: doc.payload ?? {},
            metadata: doc.metadata,
          };
          setEvents(prev => [event, ...prev].slice(0, 500));
        } catch { /* malformed */ }
      };

      es.onerror = () => {
        es.close();
        setConnected(false);
        if (!disposedRef.current) {
          reconnectRef.current = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      disposedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      esRef.current?.close();
    };
  }, []);

  return (
    <TradingEventsContext.Provider value={{ events, connected }}>
      {children}
    </TradingEventsContext.Provider>
  );
}

// ── Chat session (persists across navigation) ────────────────────────────────

interface ChatContextValue {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  serverSessionId: string | null;
  setServerSessionId: Dispatch<SetStateAction<string | null>>;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextValue>({
  messages: [],
  setMessages: () => {},
  serverSessionId: null,
  setServerSessionId: () => {},
  clearChat: () => {},
});

export const useChatSession = () => useContext(ChatContext);

function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);

  const clearChat = useCallback(() => {
    setMessages([]);
    setServerSessionId(null);
  }, []);

  return (
    <ChatContext.Provider value={{ messages, setMessages, serverSessionId, setServerSessionId, clearChat }}>
      {children}
    </ChatContext.Provider>
  );
}

// ── Root provider ─────────────────────────────────────────────────────────────

export default function Providers({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(true);
  const toggleDarkMode = useCallback(() => setDarkMode((prev) => !prev), []);

  return (
    <EmotionRegistry>
      <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
        <LeafyGreenProvider darkMode={darkMode}>
          <TradingEventsProvider>
            <ChatSessionProvider>
              {children}
            </ChatSessionProvider>
          </TradingEventsProvider>
        </LeafyGreenProvider>
      </DarkModeContext.Provider>
    </EmotionRegistry>
  );
}
