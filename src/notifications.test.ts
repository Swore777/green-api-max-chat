import { describe, expect, it } from 'vitest';
import type { NotificationBody } from './api';
import { formatPhone, messageFromHistory, messageFromNotification, normalizePhone } from './notifications';
import { reducer, type State } from './useChats';

const incoming: NotificationBody = {
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'in-1',
  timestamp: 1763115112,
  senderData: { chatId: '10000000', chatName: 'Анна', senderName: 'Анна' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
};

describe('messageFromNotification', () => {
  it('разбирает входящий текст', () => {
    expect(messageFromNotification(incoming)).toEqual({
      id: 'in-1',
      chatId: '10000000',
      text: 'Привет',
      timestamp: 1763115112,
      outgoing: false,
      senderName: 'Анна',
      status: undefined,
    });
  });

  it('берёт текст со ссылкой из extendedTextMessageData', () => {
    const m = messageFromNotification({
      ...incoming,
      messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'см. https://max.ru' } },
    });
    expect(m?.text).toBe('см. https://max.ru');
  });

  it('помечает исходящие как свои', () => {
    const m = messageFromNotification({ ...incoming, typeWebhook: 'outgoingAPIMessageReceived' });
    expect(m?.outgoing).toBe(true);
    expect(m?.senderName).toBeUndefined();
  });

  it('пропускает медиа и служебные уведомления', () => {
    expect(messageFromNotification({ ...incoming, messageData: { typeMessage: 'imageMessage' } })).toBeNull();
    expect(messageFromNotification({ typeWebhook: 'stateInstanceChanged' })).toBeNull();
    expect(messageFromNotification({ typeWebhook: 'outgoingMessageStatus', idMessage: 'x' })).toBeNull();
  });
});

describe('messageFromHistory', () => {
  const base = {
    idMessage: 'h-1',
    timestamp: 1706522263,
    typeMessage: 'textMessage',
    chatId: '79876543210@c.us',
    textMessage: 'Привет',
  };

  it('разбирает входящее и исходящее', () => {
    expect(messageFromHistory({ ...base, type: 'incoming', senderName: 'Вася' })).toMatchObject({
      id: 'h-1',
      text: 'Привет',
      outgoing: false,
      senderName: 'Вася',
    });
    expect(messageFromHistory({ ...base, type: 'outgoing' })).toMatchObject({ outgoing: true, status: 'sent' });
  });

  it('пропускает медиа', () => {
    expect(messageFromHistory({ ...base, type: 'incoming', typeMessage: 'imageMessage', textMessage: undefined })).toBeNull();
  });
});

describe('normalizePhone', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 999 123 45 67', '79991234567'],
    ['375291234567', '375291234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('отклоняет короткий номер', () => {
    expect(normalizePhone('12345')).toBeNull();
  });

  it('форматирует российский номер', () => {
    expect(formatPhone('79991234567')).toBe('+7 999 123-45-67');
  });
});

describe('reducer', () => {
  const draft = {
    id: 'local-1',
    chatId: '10000000',
    text: 'Привет',
    timestamp: 1,
    outgoing: true,
    status: 'sending' as const,
  };

  it('не дублирует эхо отправленного сообщения', () => {
    let s: State = reducer({}, { type: 'upsert', message: draft });
    s = reducer(s, { type: 'status', chatId: '10000000', id: 'local-1', status: 'sent', newId: 'srv-1' });
    s = reducer(s, { type: 'upsert', message: { ...draft, id: 'srv-1', status: 'sent' } });
    expect(s['10000000'].messages.map((m) => m.id)).toEqual(['srv-1']);
  });

  it('не дублирует, если эхо пришло раньше ответа sendMessage', () => {
    let s: State = reducer({}, { type: 'upsert', message: draft });
    s = reducer(s, { type: 'upsert', message: { ...draft, id: 'srv-1', status: 'sent' } });
    s = reducer(s, { type: 'status', chatId: '10000000', id: 'local-1', status: 'sent', newId: 'srv-1' });
    expect(s['10000000'].messages.map((m) => m.id)).toEqual(['srv-1']);
  });

  it('список чатов не затирает сообщения, а история не дублирует их', () => {
    const m = messageFromNotification(incoming)!;
    let s: State = reducer({}, { type: 'upsert', message: m });
    s = reducer(s, { type: 'chats', chats: [{ chatId: '10000000', name: 'Анна П.' }, { chatId: '20000000' }] });
    s = reducer(s, { type: 'upsertMany', chatId: '10000000', messages: [m, { ...m, id: 'in-0', timestamp: 1 }] });
    expect(s['10000000'].name).toBe('Анна П.');
    expect(s['10000000'].messages.map((x) => x.id)).toEqual(['in-0', 'in-1']);
    expect(s['20000000'].messages).toEqual([]);
  });

  it('создаёт чат при входящем от нового собеседника', () => {
    const m = messageFromNotification(incoming)!;
    const s = reducer({}, { type: 'upsert', message: m });
    expect(s['10000000'].name).toBe('Анна');
  });
});
