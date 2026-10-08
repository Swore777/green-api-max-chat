import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatPhone } from '../notifications';
import type { Chat } from '../useChats';
import { Avatar } from './Avatar';

interface Props {
  chat: Chat;
  title: string;
  avatar?: string;
  onSend: (text: string) => void;
  onBack: () => void;
}

const MAX_LENGTH = 4000; // лимит sendMessage

export function ChatView({ chat, title, avatar, onSend, onBack }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.chatId, chat.messages.length]);

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

  return (
    <>
      <header className="chat-header">
        <button className="icon-btn back" onClick={onBack} title="К списку чатов">
          ←
        </button>
        <Avatar seed={chat.chatId} title={title} src={avatar} />
        <div>
          <div className="chat-title">{title}</div>
          {chat.phone && chat.name && <div className="muted small">{formatPhone(chat.phone)}</div>}
        </div>
      </header>

      <div className="messages">
        {chat.messages.length === 0 && <div className="placeholder muted">Напишите первое сообщение</div>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.outgoing ? 'out' : 'in'} ${m.status ?? ''}`}>
            <span className="text">{m.text}</span>
            <span className="meta">
              {new Date(m.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              {m.status === 'sending' && ' · …'}
              {m.status === 'sent' && ' ✓'}
              {m.status === 'error' && <span className="failed"> · не отправлено</span>}
            </span>
          </div>
        ))}
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Сообщение"
          rows={1}
          maxLength={MAX_LENGTH}
          autoFocus
        />
        <button className="send" disabled={!draft.trim()} title="Отправить">
          ➤
        </button>
      </form>
    </>
  );
}
