import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Credentials } from '../api';
import { formatPhone } from '../notifications';
import { playPing } from '../notify';
import { useAvatars } from '../useAvatars';
import { useChats, type Chat } from '../useChats';
import { Avatar } from './Avatar';
import { ChatView } from './ChatView';
import { IconChats, IconClose, IconLogout, IconPlus, IconSearch, Ticks } from './icons';

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

const BASE_TITLE = document.title;

export function Messenger({ creds, onLogout }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const visible = usePageVisible();
  // звук — только на то, чего человек сейчас не видит
  const seenRef = useRef({ activeId, visible });
  seenRef.current = { activeId, visible };
  const { chats, connection, problems, fixSettings, openChat, send, loadHistory, markRead, typing } = useChats(creds, (m) => {
    const { activeId, visible } = seenRef.current;
    if (!visible || m.chatId !== activeId) playPing();
  });
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  // свежие сверху; созданный здесь пустой чат — по времени создания,
  // подгруженные без истории — ниже, в порядке активности от GREEN-API
  const list = useMemo(() => {
    const lastAt = (c: Chat) => c.messages.at(-1)?.timestamp ?? c.createdAt ?? 0;
    return Object.values(chats).sort((a, b) => lastAt(b) - lastAt(a));
  }, [chats]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => chatTitle(c).toLowerCase().includes(q) || c.chatId.includes(q) || c.messages.at(-1)?.text.toLowerCase().includes(q),
    );
  }, [list, query]);
  const active = activeId ? chats[activeId] : undefined;
  const avatars = useAvatars(
    creds,
    useMemo(() => list.map((c) => c.chatId), [list]),
  );

  useEffect(() => {
    if (activeId) loadHistory(activeId);
  }, [activeId, loadHistory]);

  // открытый чат на видимой вкладке прочитан сразу
  useEffect(() => {
    if (active?.unread && visible) markRead(active.chatId);
  }, [active?.chatId, active?.unread, visible, markRead]);

  // счётчик во вкладке — для того, чего человек ещё не видел
  const unseen = list.reduce((n, c) => n + (c.chatId === activeId && visible ? 0 : (c.unread ?? 0)), 0);
  useEffect(() => {
    document.title = unseen > 0 ? `(${unseen}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unseen]);
  useEffect(() => () => void (document.title = BASE_TITLE), []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const chatId = await openChat(phone);
      setActiveId(chatId);
      setCreating(false);
      setPhone('');
      setQuery('');
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
            {creating ? <IconClose /> : <IconPlus />}
          </button>
          <button className="icon-btn" title="Выйти" onClick={onLogout}>
            <IconLogout />
          </button>
        </header>

        {creating ? (
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
        ) : (
          <label className="search">
            <IconSearch />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" type="search" />
          </label>
        )}

        {problems.length > 0 && <SettingsBanner problems={problems} onFix={fixSettings} />}

        {connection === 'reconnecting' && <div className="banner">Нет связи с GREEN-API, переподключаемся…</div>}

        <ul className="chat-list">
          {list.length === 0 && !creating && (
            <li className="empty muted">Чатов пока нет. Нажмите «+», чтобы написать по номеру телефона.</li>
          )}
          {list.length > 0 && shown.length === 0 && <li className="empty muted">Ничего не найдено</li>}
          {shown.map((chat) => {
            const last = chat.messages.at(-1);
            const title = chatTitle(chat);
            const unread = chat.chatId === activeId ? 0 : (chat.unread ?? 0);
            return (
              <li key={chat.chatId}>
                <button
                  className={`chat-item ${chat.chatId === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(chat.chatId)}
                >
                  <Avatar seed={chat.chatId} title={title} src={avatars[chat.chatId]} />
                  <span className="chat-item-body">
                    <span className="chat-item-top">
                      <span className="chat-item-title">{title}</span>
                      {last && <time className={unread ? 'accent' : ''}>{formatTime(last.timestamp)}</time>}
                    </span>
                    <span className="chat-item-bottom">
                      <span className="chat-item-preview">
                        {last?.outgoing && last.status && last.status !== 'sending' && last.status !== 'error' && (
                          <Ticks status={last.status} />
                        )}
                        {last ? `${last.outgoing ? 'Вы: ' : ''}${last.text}` : 'Нет сообщений'}
                      </span>
                      {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
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
            key={active.chatId}
            avatar={avatars[active.chatId]}
            chat={active}
            title={chatTitle(active)}
            onSend={(text) => send(active.chatId, text)}
            onTyping={() => typing(active.chatId)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="placeholder">
            <span className="placeholder-icon">
              <IconChats />
            </span>
            <div className="placeholder-title">Выберите чат</div>
            <div className="muted small">или нажмите «+», чтобы написать по номеру телефона</div>
          </div>
        )}
      </main>
    </div>
  );
}

function SettingsBanner({ problems, onFix }: { problems: string[]; onFix: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="banner warn">
      <b>Ответы могут не приходить.</b> В настройках инстанса {problems.join('; ')}.
      <button
        className="primary small-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onFix();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'не удалось');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Исправляем…' : 'Исправить'}
      </button>
      {error && <div className="error">Не удалось изменить настройки: {error}</div>}
    </div>
  );
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
