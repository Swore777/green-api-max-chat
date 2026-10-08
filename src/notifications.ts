import type { NotificationBody } from './api';

export interface ChatMessage {
  id: string;
  chatId: string;
  text: string;
  /** unix-время в секундах */
  timestamp: number;
  outgoing: boolean;
  /** только для входящих: имя из профиля MAX */
  senderName?: string;
  status?: 'sending' | 'sent' | 'error';
}

// Отправленные из этого интерфейса сообщения тоже приходят в очередь
// (outgoingAPIMessageReceived) — их берём, чтобы видеть историю
// после перезагрузки, а дубли отсекаются по idMessage.
const INCOMING = 'incomingMessageReceived';
const OUTGOING = new Set(['outgoingMessageReceived', 'outgoingAPIMessageReceived']);

/**
 * Достаёт текстовое сообщение из уведомления. Всё остальное (статусы,
 * медиа, смена состояния инстанса) — null: по заданию нужен только текст.
 */
export function messageFromNotification(body: NotificationBody): ChatMessage | null {
  const incoming = body.typeWebhook === INCOMING;
  if (!incoming && !OUTGOING.has(body.typeWebhook)) return null;
  if (!body.idMessage || !body.senderData || !body.messageData) return null;

  const text = extractText(body.messageData);
  if (text === null) return null;

  return {
    id: body.idMessage,
    chatId: body.senderData.chatId,
    text,
    timestamp: body.timestamp ?? Math.floor(Date.now() / 1000),
    outgoing: !incoming,
    senderName: incoming ? body.senderData.senderName || body.senderData.chatName : undefined,
    status: incoming ? undefined : 'sent',
  };
}

function extractText(data: NonNullable<NotificationBody['messageData']>): string | null {
  switch (data.typeMessage) {
    case 'textMessage':
      return data.textMessageData?.textMessage ?? null;
    // текст со ссылкой или цитатой — для пользователя это тоже обычный текст
    case 'extendedTextMessage':
    case 'quotedMessage':
      return data.extendedTextMessageData?.text ?? null;
    default:
      return null;
  }
}

/** «+7 (999) 123-45-67» → «79991234567»; null, если это не похоже на номер. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  // российский номер, набранный через 8
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  return digits.length >= 11 && digits.length <= 12 ? digits : null;
}

export function formatPhone(digits: string): string {
  const m = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : `+${digits}`;
}
