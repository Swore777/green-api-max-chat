import { useEffect, useRef, useState } from 'react';
import { getAvatar, type Credentials } from './api';

// Ссылки на CDN мессенджера подписаны и со временем протухают
const TTL_MS = 24 * 60 * 60 * 1000;
// По одному запросу с паузой — 50 чатов не должны упереться в лимиты API
const PAUSE_MS = 300;

interface Cached {
  /** '' — фото нет или скрыто приватностью */
  url: string;
  at: number;
}

const storageKey = (c: Credentials) => `max-chat:avatars:${c.idInstance}`;

function loadCache(c: Credentials): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(storageKey(c));
    const all = raw ? (JSON.parse(raw) as Record<string, Cached>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, v]) => now - v.at < TTL_MS));
  } catch {
    return {};
  }
}

/** chatId → адрес картинки; пустая строка или отсутствие — рисуем букву. */
export function useAvatars(creds: Credentials, chatIds: string[]): Record<string, string> {
  const [cache, setCache] = useState(() => loadCache(creds));
  // base64 бывает большим — держим только в памяти, в localStorage не кладём
  const [inline, setInline] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(creds), JSON.stringify(cache));
    } catch {
      // без кеша просто запросим ещё раз
    }
  }, [cache, creds]);

  const key = chatIds.join(',');
  useEffect(() => {
    const queue = chatIds.filter((id) => !(id in cache) && !requested.current.has(id));
    if (queue.length === 0) return;
    let cancelled = false;

    (async () => {
      for (const chatId of queue) {
        if (cancelled) return;
        requested.current.add(chatId);
        try {
          const r = await getAvatar(creds, chatId);
          const url = (r?.available !== false && r?.urlAvatar) || '';
          if (!url && r?.base64Avatar) {
            setInline((s) => ({ ...s, [chatId]: `data:image/jpeg;base64,${r.base64Avatar}` }));
          }
          setCache((s) => ({ ...s, [chatId]: { url, at: Date.now() } }));
        } catch (e) {
          // метода нет у мессенджера или лимит — остаёмся на букве до перезагрузки
          console.warn('getAvatar:', e);
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    })();

    return () => {
      cancelled = true;
      // недогруженное в следующий раз запросим заново
      for (const id of queue) if (!(id in cache)) requested.current.delete(id);
    };
    // очередь зависит от набора чатов (key), а не от ссылки на массив
  }, [key, creds]);

  const result: Record<string, string> = {};
  for (const [id, v] of Object.entries(cache)) if (v.url) result[id] = v.url;
  return { ...inline, ...result };
}
