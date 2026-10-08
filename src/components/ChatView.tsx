import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatPhone, type ChatMessage } from '../notifications';
import type { Chat } from '../useChats';
import { Avatar } from './Avatar';
import { IconBack, IconSend, Ticks } from './icons';

interface Props {
  chat: Chat;
  title: string;
  avatar?: string;
  onSend: (text: string) => void;
  onTyping: () => void;
  onBack: () => void;
}

const MAX_LENGTH = 4000; // лимит sendMessage
// сообщения одного автора с паузой меньше этой склеиваются в группу
const GROUP_GAP_SEC = 5 * 60;

export function ChatView({ chat, title, avatar, onSend, onTyping, onBack }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);

  useEffect(() => {
    // при открытии — сразу вниз, дальше — плавно к новому сообщению
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: firstScroll.current ? 'auto' : 'smooth' });
    firstScroll.current = false;
  }, [chat.messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  // Enter — отправить, Shift+Enter — перенос строки, как в web.max.ru
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const subtitle = chat.phone && chat.name ? formatPhone(chat.phone) : null;

  return (
    <>
      <header className="chat-header">
        <button className="icon-btn back" onClick={onBack} title="К списку чатов">
          <IconBack />
        </button>
        <Avatar seed={chat.chatId} title={title} src={avatar} />
        <div className="chat-header-text">
          <div className="chat-title">{title}</div>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
      </header>

      <div className="messages">
        {chat.messages.length === 0 && (
          <div className="placeholder">
            <div className="placeholder-title">Здесь пока пусто</div>
            <div className="muted small">Напишите первое сообщение</div>
          </div>
        )}
        {chat.messages.map((m, i) => {
          const prev = chat.messages[i - 1];
          const next = chat.messages[i + 1];
          const newDay = !prev || dayKey(prev) !== dayKey(m);
          const groupStart = newDay || !sameGroup(prev, m);
          const groupEnd = !next || dayKey(next) !== dayKey(m) || !sameGroup(m, next);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="day">
                  <span>{formatDay(m.timestamp)}</span>
                </div>
              )}
              <div
                className={[
                  'bubble',
                  m.outgoing ? 'out' : 'in',
                  m.status === 'sending' || m.status === 'error' ? m.status : '',
                  groupStart ? 'first' : '',
                  groupEnd ? 'last' : '',
                ].join(' ')}
              >
                <span className="text">{m.text}</span>
                <span className="meta">
                  {new Date(m.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  {m.status === 'sending' && <span className="clock" title="Отправляется" />}
                  {(m.status === 'sent' || m.status === 'delivered' || m.status === 'read') && <Ticks status={m.status} />}
                </span>
                {m.status === 'error' && <span className="failed">Не отправлено</span>}
              </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={onKeyDown}
          placeholder="Сообщение"
          rows={1}
          maxLength={MAX_LENGTH}
          autoFocus
        />
        <button className="send" disabled={!draft.trim()} title="Отправить">
          <IconSend />
        </button>
      </form>
    </>
  );
}

function sameGroup(a: ChatMessage, b: ChatMessage): boolean {
  return a.outgoing === b.outgoing && a.senderName === b.senderName && b.timestamp - a.timestamp < GROUP_GAP_SEC;
}

const dayKey = (m: ChatMessage) => new Date(m.timestamp * 1000).toDateString();

function formatDay(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}
