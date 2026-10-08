import { useState } from 'react';
import type { Credentials } from './api';
import { Login } from './components/Login';
import { Messenger } from './components/Messenger';

const CREDS_KEY = 'max-chat:credentials';

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [creds, setCreds] = useState<Credentials | null>(loadCredentials);

  const login = (c: Credentials, remember: boolean) => {
    try {
      if (remember) localStorage.setItem(CREDS_KEY, JSON.stringify(c));
    } catch {
      // без хранилища просто не запомним вход
    }
    setCreds(c);
  };

  const logout = () => {
    try {
      localStorage.removeItem(CREDS_KEY);
    } catch {
      // нечего удалять
    }
    setCreds(null);
  };

  if (!creds) return <Login onLogin={login} />;
  // key: при смене инстанса состояние чатов и цикл опроса пересоздаются с нуля
  return <Messenger key={creds.idInstance} creds={creds} onLogout={logout} />;
}
