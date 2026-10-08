import type { ReactNode } from 'react';

// Небольшой набор линейных иконок — без зависимостей ради пяти картинок
type P = { size?: number };

const svg = (size: number, children: ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export const IconPlus = ({ size = 20 }: P) => svg(size, <path d="M12 5v14M5 12h14" />);
export const IconClose = ({ size = 20 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const IconBack = ({ size = 20 }: P) => svg(size, <path d="M15 18l-6-6 6-6" />);
export const IconSearch = ({ size = 18 }: P) =>
  svg(
    size,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
  );
export const IconLogout = ({ size = 20 }: P) =>
  svg(
    size,
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
  );
export const IconSend = ({ size = 20 }: P) =>
  svg(
    size,
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>,
  );
export const IconChats = ({ size = 56 }: P) =>
  svg(size, <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />);

/** ✓ — отправлено, ✓✓ — доставлено, зелёные ✓✓ — прочитано */
export function Ticks({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  const double = status !== 'sent';
  return (
    <svg className={`ticks ${status}`} width={double ? 18 : 12} height={12} viewBox={`0 0 ${double ? 18 : 12} 12`} aria-label={status}>
      <path d="M1 6.5l3 3L11 2" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {double && (
        <path d="M8 8l1.5 1.5L17 2" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
