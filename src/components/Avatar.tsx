import { useState } from 'react';

// Оттенки фирменного зелёного GREEN-API; цвет стабилен для одного собеседника
const GRADIENTS = [
  ['#3b9702', '#55b31c'],
  ['#2e7d32', '#4caf50'],
  ['#1f8a70', '#34b38a'],
  ['#5c8a00', '#8bc34a'],
  ['#0f766e', '#14a38f'],
  ['#4d7c0f', '#6fae2b'],
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
