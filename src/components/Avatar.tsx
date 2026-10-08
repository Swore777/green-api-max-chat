// Градиенты в духе аватаров MAX; цвет стабилен для одного собеседника
const GRADIENTS = [
  ['#5b8cff', '#7a5cff'],
  ['#ff7a59', '#ff4d8d'],
  ['#2ec5a6', '#2a9df4'],
  ['#ffb547', '#ff7a45'],
  ['#a35cff', '#e05cff'],
  ['#36c26b', '#1fa2a2'],
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Avatar({ seed, title }: { seed: string; title: string }) {
  const [a, b] = GRADIENTS[hash(seed) % GRADIENTS.length];
  const letter = /\p{L}/u.test(title[0] ?? '') ? title[0].toUpperCase() : '#';
  return (
    <span className="avatar" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      {letter}
    </span>
  );
}
