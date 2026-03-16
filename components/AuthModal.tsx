import { useEffect, useState } from 'react';

export type CloudSyncStatus = 'LOCAL_ONLY' | 'SYNCING' | 'SYNCED' | 'ERROR';

type AuthMode = 'SIGN_IN' | 'SIGN_UP';

interface AuthModalProps {
  t: any;
  onClose: () => void;
  isSupabaseConfigured: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  busy: boolean;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  email: string | null;
  nickname: string;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  notice: string | null;
  onSignIn: (payload: { email: string; password: string }) => Promise<void> | void;
  onSignUp: (payload: { email: string; password: string; nickname: string }) => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onSaveNickname: (nickname: string) => Promise<void> | void;
  onSyncNow: () => Promise<void> | void;
}

const syncToneMap: Record<CloudSyncStatus, string> = {
  LOCAL_ONLY: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  SYNCING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SYNCED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ERROR: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

export function AuthModal({
  t,
  onClose,
  isSupabaseConfigured,
  isAuthenticated,
  authLoading,
  busy,
  mode,
  onModeChange,
  email,
  nickname,
  syncStatus,
  lastSyncedAt,
  error,
  notice,
  onSignIn,
  onSignUp,
  onSignOut,
  onSaveNickname,
  onSyncNow,
}: AuthModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');

  useEffect(() => {
    setEmailInput(email ?? '');
    setNicknameInput(nickname ?? '');
    setPasswordInput('');
  }, [email, nickname, mode, isAuthenticated]);

  const syncLabel = syncStatus === 'SYNCING'
    ? t.account_syncing
    : syncStatus === 'SYNCED'
      ? t.account_synced
      : syncStatus === 'ERROR'
        ? t.account_sync_error
        : isSupabaseConfigured
          ? t.account_local_only
          : t.account_env_missing;

  return (
    <div className="absolute inset-0 z-[110] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-emerald-50 via-sky-50 to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-widest uppercase">{t.menu_account}</h2>
            <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">{isAuthenticated ? t.account_connected : t.account_guest_desc}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {!isSupabaseConfigured && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="font-bold mb-1">{t.account_env_missing}</div>
              <div>{t.account_env_missing_desc}</div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200">
              {notice}
            </div>
          )}

          {isAuthenticated ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-white grid place-items-center text-lg font-black uppercase">
                    {(nickname || email || 'G').slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{nickname || t.account_no_nickname}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{email}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${syncToneMap[syncStatus]}`}>{syncLabel}</span>
                  <button
                    onClick={() => void onSyncNow()}
                    disabled={busy || authLoading || !isSupabaseConfigured}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 disabled:opacity-50"
                  >
                    {t.account_sync_now}
                  </button>
                </div>

                {lastSyncedAt && (
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t.account_last_sync}: {lastSyncedAt}</div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.account_nickname}</label>
                <input
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value.slice(0, 24))}
                  placeholder={t.account_nickname_placeholder}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void onSaveNickname(nicknameInput.trim())}
                  disabled={busy || authLoading || nicknameInput.trim().length < 2}
                  className="py-3 rounded-2xl bg-emerald-500 text-white font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  {busy ? t.account_working : t.account_save_profile}
                </button>
                <button
                  onClick={() => void onSignOut()}
                  disabled={busy || authLoading}
                  className="py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  {t.account_sign_out}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1 w-full">
                <button
                  onClick={() => onModeChange('SIGN_IN')}
                  className={`flex-1 py-2 rounded-full text-sm font-bold transition-colors ${mode === 'SIGN_IN' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}
                >
                  {t.account_sign_in}
                </button>
                <button
                  onClick={() => onModeChange('SIGN_UP')}
                  className={`flex-1 py-2 rounded-full text-sm font-bold transition-colors ${mode === 'SIGN_UP' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}
                >
                  {t.account_sign_up}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.account_email}</label>
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value.trim())}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {mode === 'SIGN_UP' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.account_nickname}</label>
                  <input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value.slice(0, 24))}
                    placeholder={t.account_nickname_placeholder}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.account_password}</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => {
                  if (mode === 'SIGN_UP') {
                    void onSignUp({ email: emailInput, password: passwordInput, nickname: nicknameInput.trim() });
                    return;
                  }
                  void onSignIn({ email: emailInput, password: passwordInput });
                }}
                disabled={busy || authLoading || !isSupabaseConfigured || !emailInput || !passwordInput || (mode === 'SIGN_UP' && nicknameInput.trim().length < 2)}
                className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest disabled:opacity-50"
              >
                {busy || authLoading ? t.account_working : mode === 'SIGN_UP' ? t.account_create_account : t.account_sign_in}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
