import { useState, type FormEvent } from 'react';
import { getStateInstance, type Credentials } from '../api';
import { IconChats } from './icons';

const DEFAULT_API_URL = 'https://api.green-api.com';

const STATE_HINTS: Record<string, string> = {
  notAuthorized: 'Инстанс не авторизован — отсканируйте QR-код в личном кабинете GREEN-API',
  blocked: 'Аккаунт заблокирован',
  starting: 'Инстанс запускается, попробуйте через минуту',
  yellowCard: 'Отправка временно ограничена мессенджером',
};

interface Props {
  onLogin: (creds: Credentials, remember: boolean) => void;
}

export function Login({ onLogin }: Props) {
  const [idInstance, setIdInstance] = useState('');
  const [apiTokenInstance, setToken] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const creds: Credentials = {
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      // проверяем данные сразу, а не на первом сообщении
      const state = await getStateInstance(creds);
      if (state !== 'authorized') {
        setError(STATE_HINTS[state] ?? `Инстанс в состоянии «${state}»`);
        return;
      }
      onLogin(creds, remember);
    } catch (err) {
      setError(err instanceof Error ? `Не удалось войти: ${err.message}` : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="login-mark" aria-hidden>
          <IconChats size={34} />
        </span>
        <h1>Вход в чат</h1>
        <p className="muted">Учётные данные инстанса MAX, Telegram или WhatsApp из личного кабинета GREEN-API</p>

        <label>
          idInstance
          <input
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value)}
            inputMode="numeric"
            placeholder="3100123456"
            required
            autoFocus
          />
        </label>
        <label>
          apiTokenInstance
          <input
            value={apiTokenInstance}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            autoComplete="off"
            required
          />
        </label>
        <details>
          <summary>Дополнительно</summary>
          <label>
            apiUrl
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={DEFAULT_API_URL}
              inputMode="url"
              autoComplete="off"
            />
          </label>
          <p className="muted small">Возьмите из кабинета, если там указан адрес вида https://3100.api.green-api.com</p>
        </details>
        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Запомнить на этом устройстве
        </label>

        {error && <div className="error">{error}</div>}

        <button className="primary" disabled={busy}>
          {busy ? 'Проверяем…' : 'Войти'}
        </button>
        <a className="powered" href="https://green-api.com/" target="_blank" rel="noreferrer">
          через <img src={`${import.meta.env.BASE_URL}green-api-logo.svg`} alt="GREEN-API" />
        </a>
      </form>
    </div>
  );
}
