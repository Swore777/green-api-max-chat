// Тонкий клиент GREEN-API: только методы, которые нужны чату.
// Документация: https://green-api.com/v3/docs/api/

export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function methodUrl(c: Credentials, method: string, suffix = ''): string {
  const base = c.apiUrl.replace(/\/+$/, '');
  return `${base}/waInstance${c.idInstance}/${method}/${c.apiTokenInstance}${suffix}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? 'неверный idInstance или apiTokenInstance'
        : res.status === 429
          ? 'слишком много запросов, попробуйте позже'
          : `HTTP ${res.status}`;
    throw new ApiError(hint, res.status);
  }
  const text = await res.text();
  // receiveNotification при пустой очереди отвечает телом "null"
  return (text ? JSON.parse(text) : null) as T;
}

export type InstanceState =
  | 'authorized'
  | 'notAuthorized'
  | 'blocked'
  | 'starting'
  | 'yellowCard'
  | string;

export async function getStateInstance(c: Credentials): Promise<InstanceState> {
  const r = await call<{ stateInstance: InstanceState }>(methodUrl(c, 'getStateInstance'));
  return r.stateInstance;
}

export interface CheckAccountResult {
  exist: boolean;
  chatId: string;
}

/** Ищет аккаунт MAX по номеру телефона и возвращает его chatId. */
export function checkAccount(c: Credentials, phone: string): Promise<CheckAccountResult> {
  return call(methodUrl(c, 'checkAccount'), {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: Number(phone) }),
  });
}

export async function sendMessage(
  c: Credentials,
  chatId: string,
  message: string,
): Promise<string> {
  const r = await call<{ idMessage: string }>(methodUrl(c, 'sendMessage'), {
    method: 'POST',
    body: JSON.stringify({ chatId, message }),
  });
  return r.idMessage;
}

export interface AvatarResult {
  urlAvatar?: string;
  available?: boolean;
  base64Avatar?: string;
}

export function getAvatar(c: Credentials, chatId: string): Promise<AvatarResult | null> {
  return call(methodUrl(c, 'getAvatar'), {
    method: 'POST',
    body: JSON.stringify({ chatId }),
  });
}

export interface RemoteChat {
  id: string;
  name?: string;
  type?: 'user' | 'group' | string;
}

/** Последние чаты аккаунта, отсортированы по активности. */
export function getChats(c: Credentials, count: number): Promise<RemoteChat[] | null> {
  return call(methodUrl(c, 'getChats', `?count=${count}`));
}

export interface HistoryItem {
  type: 'incoming' | 'outgoing';
  idMessage: string;
  timestamp: number;
  typeMessage: string;
  chatId: string;
  textMessage?: string;
  extendedTextMessage?: { text?: string };
  senderName?: string;
}

/** История чата, от новых к старым. */
export function getChatHistory(c: Credentials, chatId: string, count: number): Promise<HistoryItem[] | null> {
  return call(methodUrl(c, 'getChatHistory'), {
    method: 'POST',
    body: JSON.stringify({ chatId, count }),
  });
}

export interface Notification {
  receiptId: number;
  body: NotificationBody;
}

export interface NotificationBody {
  typeWebhook: string;
  idMessage?: string;
  timestamp?: number;
  senderData?: {
    chatId: string;
    chatName?: string;
    sender?: string;
    senderName?: string;
  };
  messageData?: {
    typeMessage: string;
    textMessageData?: { textMessage: string };
    extendedTextMessageData?: { text: string };
  };
}

export function receiveNotification(
  c: Credentials,
  receiveTimeoutSec: number,
  signal?: AbortSignal,
): Promise<Notification | null> {
  return call(methodUrl(c, 'receiveNotification', `?receiveTimeout=${receiveTimeoutSec}`), {
    signal,
  });
}

export function deleteNotification(c: Credentials, receiptId: number): Promise<unknown> {
  return call(methodUrl(c, 'deleteNotification', `/${receiptId}`), { method: 'DELETE' });
}
