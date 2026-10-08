import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Credentials } from '../api';
import { formatPhone } from '../notifications';
import { useChats, type Chat } from '../useChats';
import { Avatar } from './Avatar';
import { ChatView } from './ChatView';

interface Props {
  creds: Credentials;
  onLogout: () => void;
}

export function chatTitle(chat: Chat): string {
  if (chat.name) return chat.name;
  if (chat.phone) return formatPhone(chat.phone);
  const id = chat.chatId.replace(/@.*$/, '');
  return chat.chatId.endsWith('@c.us') ? formatPhone(id) : id;
}

export function Messenger({ creds, onLogout }: Props) {
  const { chats, connection, openChat, send, loadHistory } = useChats(creds);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId) loadHistory(activeId);
  }, [activeId, loadHistory]);
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // свежие сверху; созданный здесь пустой чат — по времени создания,
  // подгруженные без истории — ниже, в порядке активности от GREEN-API
  const list = useMemo(() => {
    const lastAt = (c: Chat) => c.messages.at(-1)?.timestamp ?? c.createdAt ?? 0;
    return Object.values(chats).sort((a, b) => lastAt(b) - lastAt(a));
  }, [chats]);
  const active = activeId ? chats[activeId] : undefined;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const chatId = await openChat(phone);
      setActiveId(chatId);
      setCreating(false);
      setPhone('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать чат');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`messenger ${active ? 'has-active' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <span className="brand">Чаты</span>
          <button className="icon-btn" title="Новый чат" onClick={() => setCreating((v) => !v)}>
            {creating ? '×' : '+'}
          </button>
          <button className="icon-btn" title="Выйти" onClick={onLogout}>
            ⎋
          </button>
        </header>

        {creating && (
          <form className="new-chat" onSubmit={create}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Номер, например +7 999 123-45-67"
              inputMode="tel"
              autoFocus
            />
            <button className="primary" disabled={busy || !phone.trim()}>
              {busy ? '…' : 'Создать'}
            </button>
            {error && <div className="error">{error}</div>}
          </form>
        )}

        {connection === 'reconnecting' && <div className="banner">Нет связи с GREEN-API, переподключаемся…</div>}

        <ul className="chat-list">
          {list.length === 0 && !creating && (
            <li className="empty muted">Чатов пока нет. Нажмите «+», чтобы написать по номеру телефона.</li>
          )}
          {list.map((chat) => {
            const last = chat.messages.at(-1);
            const title = chatTitle(chat);
            return (
              <li key={chat.chatId}>
                <button
                  className={`chat-item ${chat.chatId === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(chat.chatId)}
                >
                  <Avatar seed={chat.chatId} title={title} />
                  <span className="chat-item-body">
                    <span className="chat-item-top">
                      <span className="chat-item-title">{title}</span>
                      {last && <time>{formatTime(last.timestamp)}</time>}
                    </span>
                    <span className="chat-item-preview">
                      {last ? `${last.outgoing ? 'Вы: ' : ''}${last.text}` : 'Нет сообщений'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="main">
        {active ? (
          <ChatView
            chat={active}
            title={chatTitle(active)}
            onSend={(text) => send(active.chatId, text)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="placeholder muted">Выберите чат или создайте новый</div>
        )}
      </main>
    </div>
  );
}

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
