import { useState } from 'react';

// Градиенты аватаров web.max.ru (malachite, dark-sky, tangerine, orchid);
// фиолетовый lilac из их набора убран. Цвет стабилен для одного собеседника.
const GRADIENTS = [
  ['#1bd6e3', '#27a5c8'],
  ['#79bcff', '#4289ed'],
  ['#ffb381', '#e5782d'],
  ['#fa82ba', '#e74aa6'],
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

interface Props {
  seed: string;
  title: string;
  /** настоящее фото; если нет или не загрузилось — буква на градиенте */
  src?: string;
}

export function Avatar({ seed, title, src }: Props) {
  const [failed, setFailed] = useState<string | null>(null);

  if (src && failed !== src) {
    return <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
  }

  const [a, b] = GRADIENTS[hash(seed) % GRADIENTS.length];
  const letter = /\p{L}/u.test(title[0] ?? '') ? title[0].toUpperCase() : '#';
  return (
    <span className="avatar" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      {letter}
    </span>
  );
}
