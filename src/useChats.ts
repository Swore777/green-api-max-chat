import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ApiError,
  checkAccount,
  deleteNotification,
  receiveNotification,
  sendMessage,
  type Credentials,
} from './api';
import { messageFromNotification, normalizePhone, type ChatMessage } from './notifications';

export interface Chat {
  chatId: string;
  /** номер, по которому чат создан вручную */
  phone?: string;
  /** имя из профиля MAX, если собеседник уже писал */
  name?: string;
  messages: ChatMessage[];
}

export type State = Record<string, Chat>;

export type Action =
  | { type: 'open'; chatId: string; phone?: string }
  | { type: 'upsert'; message: ChatMessage }
  | { type: 'status'; chatId: string; id: string; status: ChatMessage['status']; newId?: string };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'open': {
      const chat = state[action.chatId];
      if (chat && (chat.phone || !action.phone)) return state;
      return {
        ...state,
        [action.chatId]: { ...(chat ?? { chatId: action.chatId, messages: [] }), phone: action.phone },
      };
    }
    case 'upsert': {
      const m = action.message;
      const chat = state[m.chatId] ?? { chatId: m.chatId, messages: [] };
      // отправленное отсюда сообщение уже есть в чате — эхо из очереди не дублируем
      if (chat.messages.some((x) => x.id === m.id)) return state;
      const messages = [...chat.messages, m].sort((a, b) => a.timestamp - b.timestamp);
      return {
        ...state,
        [m.chatId]: { ...chat, name: m.senderName ?? chat.name, messages },
      };
    }
    case 'status': {
      const chat = state[action.chatId];
      if (!chat) return state;
      // эхо из очереди успело прийти раньше ответа sendMessage — черновик лишний
      if (action.newId && chat.messages.some((m) => m.id === action.newId)) {
        const messages = chat.messages.filter((m) => m.id !== action.id);
        return { ...state, [action.chatId]: { ...chat, messages } };
      }
      const messages = chat.messages.map((m) =>
        m.id === action.id ? { ...m, status: action.status, id: action.newId ?? m.id } : m,
      );
      return { ...state, [action.chatId]: { ...chat, messages } };
    }
  }
}

const storageKey = (c: Credentials) => `max-chat:${c.idInstance}`;

function loadChats(c: Credentials): State {
  try {
    const raw = localStorage.getItem(storageKey(c));
    return raw ? (JSON.parse(raw) as State) : {};
  } catch {
    return {};
  }
}

export type Connection = 'online' | 'reconnecting';

// Long-poll: сервер держит запрос до 20 с, пока не появится уведомление
const RECEIVE_TIMEOUT_SEC = 20;
const RETRY_DELAY_MS = 3000;

export function useChats(creds: Credentials) {
  const [chats, dispatch] = useReducer(reducer, creds, loadChats);
  const [connection, setConnection] = useState<Connection>('online');
  const credsRef = useRef(creds);
  credsRef.current = creds;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(creds), JSON.stringify(chats));
    } catch {
      // переполненное или запрещённое хранилище — чат работает и без истории
    }
  }, [chats, creds]);

  // Цикл получения: receiveNotification → обработать → deleteNotification.
  // Удаляем любое уведомление, даже ненужное (статусы, медиа), иначе
  // очередь встанет на нём навсегда.
  useEffect(() => {
    const abort = new AbortController();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      while (!abort.signal.aborted) {
        try {
          const n = await receiveNotification(creds, RECEIVE_TIMEOUT_SEC, abort.signal);
          setConnection('online');
          if (!n) continue;
          const message = messageFromNotification(n.body);
          if (message) dispatch({ type: 'upsert', message });
          await deleteNotification(creds, n.receiptId);
        } catch (e) {
          if (abort.signal.aborted) return;
          console.warn('receiveNotification:', e);
          setConnection('reconnecting');
          await sleep(RETRY_DELAY_MS);
        }
      }
    })();

    return () => abort.abort();
  }, [creds]);

  /** Создаёт чат по номеру. Возвращает chatId или бросает понятную ошибку. */
  const openChat = useCallback(async (phoneInput: string): Promise<string> => {
    const phone = normalizePhone(phoneInput);
    if (!phone) throw new Error('Введите номер в международном формате, например +7 999 123-45-67');

    // В MAX и Telegram ответы приходят от числового id пользователя, а не от номера.
    // Без checkAccount ответ собеседника попал бы в отдельный чат.
    // Инстанс WhatsApp метода не знает — тогда пишем по номеру, это его родной chatId.
    let chatId = `${phone}@c.us`;
    try {
      const r = await checkAccount(credsRef.current, phone);
      if (typeof r?.exist === 'boolean') {
        if (!r.exist) throw new Error('На этом номере нет аккаунта в мессенджере (или номер скрыт настройками приватности)');
        chatId = r.chatId;
      }
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }

    dispatch({ type: 'open', chatId, phone });
    return chatId;
  }, []);

  const send = useCallback(async (chatId: string, text: string) => {
    const tempId = `local-${crypto.randomUUID()}`;
    dispatch({
      type: 'upsert',
      message: {
        id: tempId,
        chatId,
        text,
        timestamp: Math.floor(Date.now() / 1000),
        outgoing: true,
        status: 'sending',
      },
    });
    try {
      const idMessage = await sendMessage(credsRef.current, chatId, text);
      dispatch({ type: 'status', chatId, id: tempId, status: 'sent', newId: idMessage });
    } catch (e) {
      console.warn('sendMessage:', e);
      dispatch({ type: 'status', chatId, id: tempId, status: 'error' });
    }
  }, []);

  return { chats, connection, openChat, send };
}
