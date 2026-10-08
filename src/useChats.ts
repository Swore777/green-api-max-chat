import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ApiError,
  checkAccount,
  deleteNotification,
  getChatHistory,
  getChats,
  getSettings,
  onQuotaExceeded,
  readChat,
  receiveNotification,
  sendMessage,
  sendTyping,
  setSettings,
  type Credentials,
  type InstanceSettings,
} from './api';
import {
  laterStatus,
  messageFromHistory,
  messageFromNotification,
  normalizePhone,
  statusFromNotification,
  type ChatMessage,
  type DeliveryStatus,
} from './notifications';

export interface Chat {
  chatId: string;
  /** номер, по которому чат создан вручную */
  phone?: string;
  /** имя контакта или группы: из списка чатов или профиля собеседника */
  name?: string;
  /** когда чат создан здесь вручную (сек) — чтобы пустой новый чат был сверху */
  createdAt?: number;
  unread?: number;
  messages: ChatMessage[];
}

export type State = Record<string, Chat>;

export type Action =
  | { type: 'open'; chatId: string; phone?: string }
  | { type: 'chats'; chats: { chatId: string; name?: string; unread?: number }[] }
  /** countUnread — новое входящее из очереди, а не догруженная история */
  | { type: 'upsert'; message: ChatMessage; countUnread?: boolean }
  | { type: 'upsertMany'; chatId: string; messages: ChatMessage[] }
  | { type: 'status'; chatId: string; id: string; status: DeliveryStatus; newId?: string }
  | { type: 'read'; chatId: string };

function addMessages(state: State, chatId: string, incoming: ChatMessage[], countUnread = false): State {
  const chat = state[chatId] ?? { chatId, messages: [] };
  const byId = new Map(incoming.map((m) => [m.id, m]));
  let changed = false;
  // уже известные сообщения не дублируем (эхо из очереди, журнал), но статус берём свежее
  const messages = chat.messages.map((m) => {
    const update = byId.get(m.id);
    if (!update) return m;
    byId.delete(m.id);
    const status = update.status && m.status ? laterStatus(m.status, update.status) : m.status;
    if (status === m.status) return m;
    changed = true;
    return { ...m, status };
  });
  const fresh = [...byId.values()];
  if (fresh.length === 0 && !changed) return state;
  messages.push(...fresh);
  messages.sort((a, b) => a.timestamp - b.timestamp);
  // в группе senderName — имя участника, а не чата, поэтому имя из списка чатов важнее
  const name = chat.name ?? fresh.find((m) => m.senderName)?.senderName;
  const newIncoming = countUnread ? fresh.filter((m) => !m.outgoing).length : 0;
  const unread = (chat.unread ?? 0) + newIncoming;
  return { ...state, [chatId]: { ...chat, name, unread, messages } };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'open': {
      const chat = state[action.chatId];
      if (chat && (chat.phone || !action.phone)) return state;
      return {
        ...state,
        [action.chatId]: {
          ...(chat ?? { chatId: action.chatId, messages: [], createdAt: Math.floor(Date.now() / 1000) }),
          phone: action.phone,
        },
      };
    }
    case 'chats': {
      const next = { ...state };
      for (const { chatId, name, unread } of action.chats) {
        const chat = next[chatId];
        next[chatId] = chat ? { ...chat, name: name || chat.name } : { chatId, name, unread, messages: [] };
      }
      return next;
    }
    case 'upsert':
      return addMessages(state, action.message.chatId, [action.message], action.countUnread);
    case 'upsertMany':
      return addMessages(state, action.chatId, action.messages);
    case 'status': {
      const chat = state[action.chatId];
      if (!chat) return state;
      // эхо из очереди успело прийти раньше ответа sendMessage — черновик лишний
      if (action.newId && chat.messages.some((m) => m.id === action.newId)) {
        const messages = chat.messages.filter((m) => m.id !== action.id);
        return { ...state, [action.chatId]: { ...chat, messages } };
      }
      if (!chat.messages.some((m) => m.id === action.id)) return state;
      const messages = chat.messages.map((m) =>
        m.id === action.id ? { ...m, status: laterStatus(m.status, action.status), id: action.newId ?? m.id } : m,
      );
      return { ...state, [action.chatId]: { ...chat, messages } };
    }
    case 'read': {
      const chat = state[action.chatId];
      if (!chat?.unread) return state;
      return { ...state, [action.chatId]: { ...chat, unread: 0 } };
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

// Без этих настроек чат не увидит ответы (incoming), статусы и свои сообщения
// с телефона, а GetChatHistory вернёт пусто. webhookUrl должен быть пустым:
// иначе GREEN-API шлёт уведомления туда, а не в очередь HTTP API.
const REQUIRED_SETTINGS: InstanceSettings = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  enableMessagesHistory: 'yes',
};

/** Какие настройки инстанса мешают чату; пустой список — всё в порядке. */
export function settingsProblems(s: InstanceSettings): string[] {
  const problems: string[] = [];
  if (s.webhookUrl) problems.push(`уведомления уходят на webhook ${s.webhookUrl}, а не в очередь`);
  if (s.incomingWebhook === 'no') problems.push('выключено получение входящих сообщений');
  if (s.outgoingWebhook === 'no') problems.push('выключены статусы доставки');
  if (s.outgoingMessageWebhook === 'no' || s.outgoingAPIMessageWebhook === 'no')
    problems.push('выключены уведомления об отправленных сообщениях');
  if (s.enableMessagesHistory === 'no') problems.push('выключено хранение истории чатов');
  return problems;
}

// Long-poll: сервер держит запрос до 20 с, пока не появится уведомление
const RECEIVE_TIMEOUT_SEC = 20;
const RETRY_DELAY_MS = 3000;
const CHATS_TO_LOAD = 50;
const HISTORY_TO_LOAD = 50;
const TYPING_MS = 5000;

/** onIncoming — новое входящее из очереди (не история): для звука и т. п. */
export function useChats(creds: Credentials, onIncoming?: (m: ChatMessage) => void) {
  const [chats, dispatch] = useReducer(reducer, creds, loadChats);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;
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
          console.debug('notification:', n.body.typeWebhook, n.body);
          if (n.body.typeWebhook === 'quotaExceeded') setQuota((q) => q ?? []);
          const message = messageFromNotification(n.body);
          if (message) {
            dispatch({ type: 'upsert', message, countUnread: true });
            if (!message.outgoing) onIncomingRef.current?.(message);
          }
          const delivery = statusFromNotification(n.body);
          if (delivery) dispatch({ type: 'status', ...delivery });
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

  const [problems, setProblems] = useState<string[]>([]);
  /** null — квота в порядке; массив — разрешённые чаты (может быть пустым, если API их не назвал) */
  const [quota, setQuota] = useState<string[] | null>(null);
  useEffect(() => onQuotaExceeded((allowed) => setQuota((q) => (allowed.length ? allowed : (q ?? [])))), []);
  const checkSettings = useCallback(async () => {
    try {
      setProblems(settingsProblems(await getSettings(credsRef.current)));
    } catch (e) {
      console.warn('getSettings:', e);
    }
  }, []);
  useEffect(() => {
    void checkSettings();
  }, [checkSettings]);

  const fixSettings = useCallback(async () => {
    await setSettings(credsRef.current, REQUIRED_SETTINGS);
    await checkSettings();
  }, [checkSettings]);

  // Существующие чаты аккаунта. Не у всех мессенджеров есть метод —
  // тогда список просто собирается из новых сообщений, как раньше.
  useEffect(() => {
    let cancelled = false;
    getChats(creds, CHATS_TO_LOAD)
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        dispatch({ type: 'chats', chats: list.map((c) => ({ chatId: c.id, name: c.name, unread: c.unreadCount })) });
      })
      .catch((e) => console.warn('getChats:', e));
    return () => {
      cancelled = true;
    };
  }, [creds]);

  // История подгружается один раз за сессию на чат — при первом открытии
  const historyLoaded = useRef(new Set<string>());
  const loadHistory = useCallback(async (chatId: string) => {
    if (historyLoaded.current.has(chatId)) return;
    historyLoaded.current.add(chatId);
    try {
      const items = await getChatHistory(credsRef.current, chatId, HISTORY_TO_LOAD);
      if (!Array.isArray(items)) return;
      const messages = items.map(messageFromHistory).filter((m): m is ChatMessage => m !== null);
      dispatch({ type: 'upsertMany', chatId, messages });
    } catch (e) {
      historyLoaded.current.delete(chatId); // дать шанс при следующем открытии
      console.warn('getChatHistory:', e);
    }
  }, []);

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

  /** Сбросить счётчик и сообщить мессенджеру, что прочитано (собеседник увидит ✓✓). */
  const markRead = useCallback((chatId: string) => {
    dispatch({ type: 'read', chatId });
    readChat(credsRef.current, chatId).catch((e) => console.warn('readChat:', e));
  }, []);

  // «Печатает…» держится TYPING_MS; пока человек набирает, продлеваем не чаще раза в TYPING_MS
  const lastTyping = useRef(0);
  const typing = useCallback((chatId: string) => {
    const now = Date.now();
    if (now - lastTyping.current < TYPING_MS) return;
    lastTyping.current = now;
    sendTyping(credsRef.current, chatId, TYPING_MS).catch((e) => console.warn('sendTyping:', e));
  }, []);

  return { chats, connection, problems, quota, fixSettings, openChat, send, loadHistory, markRead, typing };
}
