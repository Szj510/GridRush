import React, { useState, useEffect, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { GameState, PlayerId, PlayerState, CellData, GameAction, AppSettings, UserStats, PracticeConfig, PracticeRecord, GameType, Difficulty, MatchPhase, RpsMove, GameMode, FunCardId } from './types';
import { MINI_GAMES, MINI_GAME_ZH_META, Icons, TRANSLATIONS, ACHIEVEMENTS_LIST, FUN_CARDS } from './constants';
import { checkWinner, shuffleGames } from './services/gameLogic';
import { sanitizeNetworkMessage, sanitizeSettings, sanitizeStats, isValidRoomCode, RateLimiter } from './services/sanitize';
import { MiniGameRenderer } from './components/MiniGames';
import { AuthModal } from './components/AuthModal';
import type { CloudSyncStatus } from './components/AuthModal';
import { audio } from './services/audio';
import { getDefaultNickname, isValidNickname, mergeUserStats, normalizeNickname } from './services/account';
import { hasSupabaseConfig, supabase, submitFeedback } from './services/supabase';
import type { ProfileRow } from './services/supabase';

declare global {
  interface Window {
    Peer: any;
  }
}

const INITIAL_PLAYER_STATE = (id: PlayerId, name: string): PlayerState => ({
  id,
  name,
  activeCell: null,
  challengeStartTime: 0,
  stealsRemaining: 1,
  isDefending: false,
  lastHeartbeat: Date.now(),
  lastInputTime: Date.now(),
  cellFailures: {},
  cellCooldowns: {},
  stealCooldown: 0,
  freezesRemaining: 1,
  frozenUntil: 0,
  duelsRemaining: 1,
  funCardInHand: null,
});

const DEFAULT_GAME_STATE: GameState = {
  status: 'IDLE',
  cells: [],
  p1: INITIAL_PLAYER_STATE('P1', 'Player Blue'),
  p2: INITIAL_PLAYER_STATE('P2', 'Player Red'),
  winner: null,
  stealNotification: null,
  duelState: null,
  funCardEffects: { blindP1Until: 0, blindP2Until: 0, hardModeP1Until: 0, hardModeP2Until: 0, flipP1Until: 0, flipP2Until: 0 },
};

const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  theme: 'light',
  soundEnabled: true,
  musicEnabled: true,
  guidesEnabled: true,
};

const DEFAULT_STATS: UserStats = {
  onlineWins: 0,
  onlineLosses: 0,
  onlineDraws: 0,
  modeStandardWins: 0,
  modeStandardLosses: 0,
  modeStandardDraws: 0,
  modeFunWins: 0,
  modeFunLosses: 0,
  modeFunDraws: 0,
  fastestSoloRun: 0,
  totalSteals: 0,
  totalDefends: 0,
  gamesPlayed: 0,
  unlockedAchievements: [],
  practiceRecords: [],
  totalFreezes: 0,
  totalDuelWins: 0,
  totalFunCardsUsed: 0,
  rpsRoundsPlayed: 0,
  rpsRoundsWon: 0,
  rpsRoundsDraw: 0,
  rpsSeriesPlayed: 0,
  rpsSeriesWon: 0,
  rpsSeriesDraw: 0,
  rpsPickRock: 0,
  rpsPickPaper: 0,
  rpsPickScissors: 0,
  recentOnlineResults: [],
  soloRunsByDiff: {},
};

const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  difficulty: 'NORMAL',
  isBattlePreset: true,
  tutorialEnabled: false
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
};

const normalizePeerPath = (value?: string) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '/peerjs';
  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/$/, '');
};

const peerHostEnv = import.meta.env.VITE_PEERJS_HOST?.trim();
const peerPortEnv = Number.parseInt(import.meta.env.VITE_PEERJS_PORT ?? '', 10);
const peerSecureEnv = parseBooleanEnv(import.meta.env.VITE_PEERJS_SECURE, true);
const peerPathEnv = normalizePeerPath(import.meta.env.VITE_PEERJS_PATH);
const peerKeyEnv = import.meta.env.VITE_PEERJS_KEY?.trim();
const useSupabaseRelay = parseBooleanEnv(import.meta.env.VITE_NET_USE_SUPABASE_RELAY, hasSupabaseConfig);
const relayChannelPrefix = 'gridrush-relay-';
const relayBroadcastEvent = 'net-msg';
const createRelayClientId = () =>
  `relay-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const peerOptions: Record<string, unknown> | null = (() => {
  if (!peerHostEnv) return null;
  const options: Record<string, unknown> = {
    host: peerHostEnv,
    secure: peerSecureEnv,
    path: peerPathEnv,
  };
  if (Number.isFinite(peerPortEnv)) options.port = peerPortEnv;
  if (peerKeyEnv) options.key = peerKeyEnv;
  return options;
})();

const createPeerClient = (id?: string) => {
  if (!peerOptions) {
    return id ? new window.Peer(id) : new window.Peer();
  }
  return id ? new window.Peer(id, peerOptions) : new window.Peer(peerOptions);
};

// --- Modals ---

const RulesModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  const quickStartItems = [t.rules_quick_1, t.rules_quick_2, t.rules_quick_3, t.rules_quick_4];
  const flowItems = [t.rules_flow_1, t.rules_flow_2, t.rules_flow_3, t.rules_flow_4];
  const penaltyItems = [t.rules_penalty_1, t.rules_penalty_2];
  const tipItems = [t.rules_tip_1, t.rules_tip_2, t.rules_tip_3];
  const modeItems = [t.rules_mode_online, t.rules_mode_solo, t.rules_mode_practice];

  return (
    <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 max-w-2xl w-full relative animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
        <button onClick={() => { audio.playClick(); onClose(); }} className="absolute top-5 right-5 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
        <h2 className="text-2xl font-bold mb-3 text-center text-slate-900 dark:text-white tracking-widest uppercase">
          {t.rules_title}
        </h2>
        <p className="text-center text-sm md:text-base text-slate-500 dark:text-slate-400 mb-6 max-w-xl mx-auto leading-relaxed">
          {t.rules_intro}
        </p>

        <div className="space-y-5 text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed overflow-y-auto max-h-[65vh] pr-1">
          <div className="bg-slate-100 dark:bg-slate-800/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.rules_goal}</p>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
            <h3 className="text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-widest text-xs mb-3">{t.rules_mode_title}</h3>
            <ul className="space-y-2.5">
              {modeItems.map((item: string, index: number) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400 dark:bg-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/50">
            <h3 className="text-amber-700 dark:text-amber-300 font-bold uppercase tracking-widest text-xs mb-3">{t.rules_quick_title}</h3>
            <ul className="space-y-2.5">
              {quickStartItems.map((item: string, index: number) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-800 text-[11px] font-black text-amber-800 dark:text-amber-100">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50">
            <h3 className="text-blue-700 dark:text-blue-300 font-bold uppercase tracking-widest text-xs mb-3">{t.rules_flow_title}</h3>
            <ol className="space-y-2.5">
              {flowItems.map((item: string, index: number) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-800 text-[11px] font-black text-blue-800 dark:text-blue-100">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/50">
            <h3 className="text-rose-700 dark:text-rose-300 font-bold uppercase tracking-widest text-xs mb-3">{t.rules_penalty_title}</h3>
            <ul className="space-y-2.5">
              {penaltyItems.map((item: string, index: number) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-400 dark:bg-rose-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold mb-3">{t.rules_skills_intro}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800">
                <strong className="block text-red-600 dark:text-red-400 mb-2 font-semibold">⭐ {t.skill_steal}</strong>
                {t.rules_steal}
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-2xl border border-cyan-100 dark:border-cyan-800">
                <strong className="block text-cyan-600 dark:text-cyan-400 mb-2 font-semibold">❄️ {t.skill_freeze}</strong>
                {t.rules_freeze}
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800">
                <strong className="block text-purple-600 dark:text-purple-400 mb-2 font-semibold">⚔️ {t.skill_duel}</strong>
                {t.rules_duel}
              </div>
            </div>
          </div>

          <div className="bg-fuchsia-50 dark:bg-fuchsia-950/30 p-4 rounded-2xl border border-fuchsia-100 dark:border-fuchsia-900/50">
            <h3 className="text-fuchsia-700 dark:text-fuchsia-300 font-bold uppercase tracking-widest text-xs mb-2">{t.rules_fun_title}</h3>
            <p>{t.rules_fun_desc}</p>
          </div>

          <div className="bg-lime-50 dark:bg-lime-950/30 p-4 rounded-2xl border border-lime-100 dark:border-lime-900/50">
            <h3 className="text-lime-700 dark:text-lime-300 font-bold uppercase tracking-widest text-xs mb-3">{t.rules_tips_title}</h3>
            <ul className="space-y-2.5">
              {tipItems.map((item: string, index: number) => (
                <li key={index} className="flex gap-3 items-start">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-lime-400 dark:bg-lime-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button onClick={() => { audio.playClick(); onClose(); }} className="w-full mt-6 bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 font-bold py-3 rounded-xl transition-all shadow-lg">
          OK
        </button>
      </div>
    </div>
  );
};

const SettingsModal = ({ 
  settings, 
  onUpdate, 
  onClearData, 
  onClose,
  t 
}: { 
  settings: AppSettings, 
  onUpdate: (s: AppSettings) => void, 
  onClearData: () => void,
  onClose: () => void,
  t: any 
}) => {
  return (
    <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-4 mobile-safe overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-8 max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold mb-8 text-slate-900 dark:text-white flex items-center gap-3 tracking-widest uppercase">
          <Icons.Settings className="w-5 h-5" /> {t.settings_title}
        </h2>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <span className="text-slate-600 dark:text-slate-300">{t.settings_lang}</span>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button 
                onClick={() => { audio.playClick(); onUpdate({ ...settings, language: 'en' }); }}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.language === 'en' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >EN</button>
              <button 
                onClick={() => { audio.playClick(); onUpdate({ ...settings, language: 'zh' }); }}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.language === 'zh' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >中文</button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600 dark:text-slate-300">{t.settings_theme}</span>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button 
                onClick={() => { audio.playClick(); onUpdate({ ...settings, theme: 'light' }); }}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.theme === 'light' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >Light</button>
              <button 
                onClick={() => { audio.playClick(); onUpdate({ ...settings, theme: 'dark' }); }}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.theme === 'dark' ? 'bg-white dark:bg-slate-600 shadow text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >Dark</button>
            </div>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-slate-600 dark:text-slate-300">{t.settings_sound}</span>
             <button 
               onClick={() => { audio.playClick(); onUpdate({ ...settings, soundEnabled: !settings.soundEnabled }); }}
               className={`w-12 h-6 rounded-full transition-colors relative ${settings.soundEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settings.soundEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

           <div className="flex justify-between items-center">
             <span className="text-slate-600 dark:text-slate-300">{t.settings_music}</span>
             <button 
               onClick={() => { audio.playClick(); onUpdate({ ...settings, musicEnabled: !settings.musicEnabled }); }}
               className={`w-12 h-6 rounded-full transition-colors relative ${settings.musicEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settings.musicEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

          <div className="flex justify-between items-start gap-4">
             <div className="min-w-0">
               <div className="text-slate-600 dark:text-slate-300">{t.settings_guides}</div>
               <p className="mt-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">{t.settings_guides_desc}</p>
             </div>
             <button
               onClick={() => { audio.playClick(); onUpdate({ ...settings, guidesEnabled: !settings.guidesEnabled }); }}
               className={`mt-1 w-12 h-6 rounded-full transition-colors relative shrink-0 ${settings.guidesEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`}
               aria-pressed={settings.guidesEnabled}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settings.guidesEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
             <div className="flex justify-between items-center">
               <div>
                  <div className="text-red-500 font-medium text-sm">{t.settings_data}</div>
               </div>
               <button 
                 onClick={() => { audio.playClick(); onClearData(); }}
                 className="px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 rounded-lg text-xs tracking-wider uppercase transition-colors"
               >
                 {t.settings_reset}
               </button>
             </div>
          </div>
        </div>

        <button onClick={() => { audio.playClick(); onClose(); }} className="w-full mt-8 bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3 rounded-xl font-medium transition-colors hover:opacity-90 shadow-lg">
          {t.settings_close}
        </button>
      </div>
    </div>
  );
};

const FeedbackModal = ({ onClose, t }: { onClose: () => void, t: any }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<'game_idea' | 'bug_report' | 'improvement'>('game_idea');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasSupabaseConfig) {
      setError(t.feedback_error_supabase);
      return;
    }

    if (!name.trim() || !email.trim() || !content.trim()) {
      setError(t.feedback_error_required);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.feedback_error_email);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await submitFeedback({
        name: name.trim(),
        email: email.trim(),
        category,
        content: content.trim(),
      });
      
      setSuccess(true);
      audio.playSuccess();
      
      setTimeout(() => {
        onClose();
        setName('');
        setEmail('');
        setCategory('game_idea');
        setContent('');
        setSuccess(false);
      }, 2000);
    } catch (err) {
      audio.playFailure();
      setError(t.feedback_error_submit);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-4 mobile-safe">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-8 max-w-md w-full animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">{t.feedback_success_title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.feedback_success_desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-4 mobile-safe overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-8 max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold mb-2 text-slate-900 dark:text-white tracking-widest uppercase">
          {t.feedback_title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {t.feedback_subtitle}
        </p>
        
        {hasSupabaseConfig ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.feedback_name_label}</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.feedback_name_placeholder}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.feedback_email_label}</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.feedback_email_placeholder}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.feedback_category_label}</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isSubmitting}
              >
                <option value="game_idea">💡 {t.feedback_category_game_idea}</option>
                <option value="bug_report">🐛 {t.feedback_category_bug_report}</option>
                <option value="improvement">🎨 {t.feedback_category_improvement}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.feedback_content_label}</label>
              <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.feedback_content_placeholder}
                rows={4}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg text-sm tracking-wider uppercase transition-colors font-medium"
            >
              {isSubmitting ? `⏳ ${t.feedback_submitting}` : `✉ ${t.feedback_submit}`}
            </button>

            <button 
              type="button"
              onClick={() => { audio.playClick(); onClose(); }}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              {t.feedback_cancel}
            </button>
          </form>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <a
                href="https://github.com/Szj510/grid-rush/issues"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { audio.playClick(); onClose(); }}
                className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg text-sm tracking-wider uppercase transition-colors font-medium flex items-center justify-center gap-2"
              >
                → {t.feedback_github_button}
              </a>
            </div>
            <button 
              onClick={() => { audio.playClick(); onClose(); }} 
              className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-3 rounded-xl font-medium transition-colors hover:opacity-90 shadow-lg"
            >
              {t.settings_close}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const AchievementsModal = ({ stats, language, onClose, t }: { stats: UserStats, language: string, onClose: () => void, t: any }) => (
  <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full flex flex-col max-h-[80vh] animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h2 className="text-xl font-bold text-yellow-500 flex items-center gap-2 uppercase tracking-widest">
          <Icons.Trophy className="w-5 h-5" /> {t.ach_title}
        </h2>
        <button onClick={() => { audio.playClick(); onClose(); }} className="text-2xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
      </div>
      
      <div className="overflow-y-auto p-6 space-y-3 custom-scrollbar">
        {ACHIEVEMENTS_LIST.map(ach => {
          const unlocked = stats.unlockedAchievements.includes(ach.id);
          const title = language === 'zh' ? ach.titleZh : ach.titleEn;
          const desc = language === 'zh' ? ach.descZh : ach.descEn;

          return (
            <div key={ach.id} className={`p-4 rounded-xl border transition-all ${unlocked ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-slate-50 dark:bg-slate-800/50 border-transparent opacity-60'} flex items-center gap-4`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${unlocked ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                {ach.icon}
              </div>
              <div className="flex-1">
                <h3 className={`font-bold text-base ${unlocked ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

const StatsModal = ({ stats, onClose, t }: { stats: UserStats, onClose: () => void, t: any }) => {
  const [recentLimit, setRecentLimit] = React.useState<10 | 20 | 50>(20);

  const onlineWins = stats.onlineWins ?? 0;
  const onlineLosses = stats.onlineLosses ?? 0;
  const onlineDraws = stats.onlineDraws ?? 0;
  const totalOnline = onlineWins + onlineLosses + onlineDraws;

  const stdWins = stats.modeStandardWins ?? 0;
  const stdLosses = stats.modeStandardLosses ?? 0;
  const stdDraws = stats.modeStandardDraws ?? 0;
  const funWins = stats.modeFunWins ?? 0;
  const funLosses = stats.modeFunLosses ?? 0;
  const funDraws = stats.modeFunDraws ?? 0;
  const stdTotal = stdWins + stdLosses + stdDraws;
  const funTotal = funWins + funLosses + funDraws;

  const rpsRoundsPlayed = stats.rpsRoundsPlayed ?? 0;
  const rpsRoundsWon = stats.rpsRoundsWon ?? 0;
  const rpsRoundsDraw = stats.rpsRoundsDraw ?? 0;
  const rpsSeriesPlayed = stats.rpsSeriesPlayed ?? 0;
  const rpsSeriesWon = stats.rpsSeriesWon ?? 0;
  const rpsSeriesDraw = stats.rpsSeriesDraw ?? 0;
  const rpsPickRock = stats.rpsPickRock ?? 0;
  const rpsPickPaper = stats.rpsPickPaper ?? 0;
  const rpsPickScissors = stats.rpsPickScissors ?? 0;

  const winRate = totalOnline > 0 ? (onlineWins / totalOnline) * 100 : 0;
  const stdWinRate = stdTotal > 0 ? (stdWins / stdTotal) * 100 : 0;
  const funWinRate = funTotal > 0 ? (funWins / funTotal) * 100 : 0;
  const rpsRoundWinRate = rpsRoundsPlayed > 0 ? (rpsRoundsWon / rpsRoundsPlayed) * 100 : 0;
  const rpsSeriesWinRate = rpsSeriesPlayed > 0 ? (rpsSeriesWon / rpsSeriesPlayed) * 100 : 0;

  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtMs = (ms: number) => {
    if (!ms) return '--';
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    return `${min}:${String(sec % 60).padStart(2, '0')}`;
  };

  const recentAll = [...(stats.recentOnlineResults ?? [])];
  const recent = recentAll.slice(-recentLimit).reverse();
  const trend = recentAll.slice(-20);

  let currentWinStreak = 0;
  for (let i = recentAll.length - 1; i >= 0; i--) {
    if (recentAll[i].result !== 'WIN') break;
    currentWinStreak += 1;
  }
  let bestWinStreak = 0;
  let tmpStreak = 0;
  for (const item of recentAll) {
    if (item.result === 'WIN') {
      tmpStreak += 1;
      if (tmpStreak > bestWinStreak) bestWinStreak = tmpStreak;
    } else {
      tmpStreak = 0;
    }
  }

  const actionRows = [
    { key: t.stats_steals, value: stats.totalSteals ?? 0, bar: 'bg-amber-400' },
    { key: t.stats_defends, value: stats.totalDefends ?? 0, bar: 'bg-green-400' },
    { key: t.stats_freezes, value: stats.totalFreezes ?? 0, bar: 'bg-cyan-400' },
    { key: t.stats_duel_wins, value: stats.totalDuelWins ?? 0, bar: 'bg-violet-400' },
    { key: t.stats_fun_cards_used, value: stats.totalFunCardsUsed ?? 0, bar: 'bg-fuchsia-400' },
  ];
  const actionTotal = Math.max(1, actionRows.reduce((sum, row) => sum + row.value, 0));
  const actionsPerMatch = totalOnline > 0 ? actionTotal / totalOnline : 0;

  const rpsPickRows = [
    { key: t.stats_pick_rock ?? 'Rock', icon: '✊', value: rpsPickRock, bar: 'bg-slate-500' },
    { key: t.stats_pick_paper ?? 'Paper', icon: '✋', value: rpsPickPaper, bar: 'bg-blue-400' },
    { key: t.stats_pick_scissors ?? 'Scissors', icon: '✌️', value: rpsPickScissors, bar: 'bg-rose-400' },
  ];
  const totalPicks = Math.max(1, rpsPickRock + rpsPickPaper + rpsPickScissors);

  const diffRows: { id: Difficulty; label: string; value: number }[] = [
    { id: 'EASY', label: t.solo_diff_easy, value: stats.soloRunsByDiff?.EASY ?? 0 },
    { id: 'NORMAL', label: t.solo_diff_normal, value: stats.soloRunsByDiff?.NORMAL ?? 0 },
    { id: 'HARD', label: t.solo_diff_hard, value: stats.soloRunsByDiff?.HARD ?? 0 },
    { id: 'EXPERT', label: t.solo_diff_expert, value: stats.soloRunsByDiff?.EXPERT ?? 0 },
  ];

  return (
    <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-4">
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full flex flex-col max-h-[88vh] animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -left-12 w-48 h-48 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 w-64 h-64 rounded-full bg-indigo-300/20 blur-3xl" />

        <div className="relative px-5 md:px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-cyan-50 via-sky-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-widest">
              <Icons.Chart className="w-5 h-5 text-cyan-500" /> {t.stats_title}
            </h2>
            <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.stats_online_overview}</p>
          </div>
          <button onClick={() => { audio.playClick(); onClose(); }} className="text-2xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
        </div>

        <div className="relative overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 via-white to-cyan-50/70 dark:from-slate-800/70 dark:via-slate-900 dark:to-slate-800/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">{t.stats_online_overview}</div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">{fmtPct(winRate)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.stats_online_matches}: {totalOnline}</div>
                </div>
                <div
                  className="w-24 h-24 rounded-full grid place-items-center"
                  style={{ background: `conic-gradient(#22c55e ${winRate}%, rgba(148,163,184,0.2) 0)` }}
                >
                  <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-900 grid place-items-center text-sm font-black text-slate-700 dark:text-slate-200">
                    {Math.round(winRate)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className="rounded-xl bg-green-100/70 dark:bg-green-900/20 px-3 py-2">
                  <div className="text-[11px] text-green-700 dark:text-green-300 uppercase tracking-wider">{t.stats_online_wins}</div>
                  <div className="text-lg font-black text-green-700 dark:text-green-300">{onlineWins}</div>
                </div>
                <div className="rounded-xl bg-rose-100/70 dark:bg-rose-900/20 px-3 py-2">
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 uppercase tracking-wider">{t.stats_online_losses}</div>
                  <div className="text-lg font-black text-rose-700 dark:text-rose-300">{onlineLosses}</div>
                </div>
                <div className="rounded-xl bg-amber-100/70 dark:bg-amber-900/20 px-3 py-2">
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 uppercase tracking-wider">{t.stats_online_draws}</div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">{onlineDraws}</div>
                </div>
                <div className="rounded-xl bg-sky-100/70 dark:bg-sky-900/20 px-3 py-2">
                  <div className="text-[11px] text-sky-700 dark:text-sky-300 uppercase tracking-wider">{t.stats_current_streak ?? 'Current Streak'}</div>
                  <div className="text-lg font-black text-sky-700 dark:text-sky-300">{currentWinStreak}</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">{t.stats_recent_trend ?? 'Recent Form'}</div>
                {trend.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.stats_recent_empty}</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {trend.map((item, idx) => {
                      const cls = item.result === 'WIN'
                        ? 'bg-green-400'
                        : item.result === 'LOSE'
                          ? 'bg-rose-400'
                          : 'bg-amber-400';
                      return <span key={`${item.at}-${idx}`} className={`w-3 h-3 rounded-full ${cls}`} title={new Date(item.at).toLocaleString()} />;
                    })}
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.stats_best_streak ?? 'Best Win Streak'}: {bestWinStreak}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t.stats_global_title}</div>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div>{t.stats_games_played}: <span className="font-bold text-slate-900 dark:text-white">{stats.gamesPlayed}</span></div>
                <div>{t.stats_best_solo}: <span className="font-bold text-slate-900 dark:text-white">{fmtMs(stats.fastestSoloRun)}</span></div>
                <div>{t.stats_ach_unlocked}: <span className="font-bold text-slate-900 dark:text-white">{stats.unlockedAchievements.length}</span></div>
                <div>{t.stats_practice_records}: <span className="font-bold text-slate-900 dark:text-white">{stats.practiceRecords.length}</span></div>
                <div>{t.stats_actions_per_match ?? 'Actions per Match'}: <span className="font-bold text-slate-900 dark:text-white">{actionsPerMatch.toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t.stats_mode_split ?? 'MODE SPLIT'}</div>
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                    <span>{t.stats_mode_standard}</span>
                    <span>{fmtPct(stdWinRate)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
                    <div className="h-full bg-sky-400" style={{ width: `${stdWinRate}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{stdWins}-{stdLosses}-{stdDraws} ({stdTotal})</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                    <span>{t.stats_mode_fun}</span>
                    <span>{fmtPct(funWinRate)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
                    <div className="h-full bg-fuchsia-400" style={{ width: `${funWinRate}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{funWins}-{funLosses}-{funDraws} ({funTotal})</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t.stats_rps_title}</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                    <span>{t.stats_rps_round_win_rate}</span>
                    <span>{fmtPct(rpsRoundWinRate)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${rpsRoundWinRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                    <span>{t.stats_rps_series_win_rate}</span>
                    <span>{fmtPct(rpsSeriesWinRate)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-indigo-400" style={{ width: `${rpsSeriesWinRate}%` }} />
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-300 pt-1">
                  {t.stats_rps_rounds}: {rpsRoundsWon}/{rpsRoundsPlayed} · {t.stats_rps_draws}: {rpsRoundsDraw}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  {t.stats_rps_series}: {rpsSeriesWon}/{rpsSeriesPlayed} · {t.stats_rps_draws}: {rpsSeriesDraw}
                </div>

                <div className="pt-1">
                  <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">{t.stats_pick_distribution ?? 'Pick Distribution'}</div>
                  <div className="space-y-2">
                    {rpsPickRows.map(row => (
                      <div key={row.key}>
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                          <span>{row.icon} {row.key}</span>
                          <span>{row.value} ({fmtPct((row.value / totalPicks) * 100)})</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div className={`h-full ${row.bar}`} style={{ width: `${(row.value / totalPicks) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t.stats_action_breakdown}</div>
              <div className="space-y-2">
                {actionRows.map(row => {
                  const width = (row.value / actionTotal) * 100;
                  return (
                    <div key={row.key}>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300 mb-1">
                        <span>{row.key}</span>
                        <span>{row.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className={`h-full ${row.bar}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">{t.stats_solo_bests}</div>
              <div className="space-y-2">
                {diffRows.map(row => (
                  <div key={row.id} className="flex justify-between items-center rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmtMs(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">{t.stats_recent_matches}</div>
              <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
                {[10, 20, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => { audio.playClick(); setRecentLimit(n as 10 | 20 | 50); }}
                    className={`px-3 py-1 text-xs rounded-full font-bold transition-colors ${recentLimit === n ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {recent.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">{t.stats_recent_empty}</div>
            ) : (
              <div className="space-y-2">
                {recent.map((item, idx) => {
                  const resultText = item.result === 'WIN'
                    ? t.stats_result_win
                    : item.result === 'LOSE'
                      ? t.stats_result_lose
                      : t.stats_result_draw;
                  const resultClass = item.result === 'WIN'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : item.result === 'LOSE'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
                  const modeText = item.mode === 'FUN' ? t.stats_mode_fun : t.stats_mode_standard;

                  return (
                    <div key={`${item.at}-${idx}`} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${resultClass}`}>{resultText}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">{modeText}</span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(item.at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Components ---

const MainMenu = ({ 
  onShowAccount,
  onOnline, 
  onChallenge, 
  onPractice,
  onShowRules,
  onShowSettings,
  onShowAchievements,
  onShowStats,
  onShowFeedback,
  accountLabel,
  accountConnected,
  t
}: any) => (
  <div className="absolute inset-0 z-20 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-start md:justify-center p-4 md:p-6 mobile-safe-top mobile-safe-bottom overflow-y-auto">
    <div className="absolute left-4 right-4 top-4 md:left-auto md:right-6 md:top-6 flex justify-end gap-2 md:gap-3 z-10">
      <button 
        onClick={() => { audio.playClick(); onShowAccount(); }}
        className="h-11 md:h-12 px-2.5 md:px-3 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center gap-2 text-slate-700 dark:text-slate-100 transition-all max-w-[12rem] md:max-w-[14rem]"
      >
        <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-black uppercase ${accountConnected ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200'}`}>
          {String(accountLabel || '?').slice(0, 1)}
        </span>
        <span className="hidden lg:block text-xs font-bold uppercase tracking-widest truncate">{accountLabel}</span>
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowStats(); }}
        className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-cyan-500 transition-all"
      >
        <Icons.Chart className="w-5 h-5" />
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowAchievements(); }}
        className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-yellow-500 transition-all"
      >
        <Icons.Trophy className="w-5 h-5" />
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowSettings(); }}
        className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all"
      >
        <Icons.Settings className="w-5 h-5" />
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowRules(); }}
        className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-bold transition-all"
      >
        ?
      </button>
    </div>
    
    <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 flex gap-2 md:gap-3 flex-col z-10">
      <button 
        onClick={() => { audio.playClick(); onShowFeedback(); }}
        className="h-9 md:h-10 px-2.5 md:px-3 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center gap-2 text-indigo-600 dark:text-indigo-400 transition-all font-medium text-[10px] md:text-xs uppercase tracking-widest"
      >
        💬 {t.feedback_button}
      </button>
      <a
        href="https://github.com/Szj510/GridRush"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => audio.playClick()}
        className="h-9 md:h-10 px-2.5 md:px-3 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center gap-2 text-gray-700 dark:text-gray-300 transition-all font-medium text-[10px] md:text-xs uppercase tracking-widest"
      >
        ⭐ {t.repo_link}
      </a>
    </div>

    <div className="mt-20 md:mt-0 mb-8 md:mb-16 text-center">
      <h1 className="text-5xl sm:text-6xl md:text-8xl font-black mb-3 md:mb-4 text-slate-900 dark:text-white tracking-tighter drop-shadow-sm">
        GRID<span className="text-blue-500">RUSH</span>
      </h1>
      <p className="text-slate-400 font-mono text-xs md:text-base tracking-[0.2em] md:tracking-[0.3em] uppercase">{t.menu_subtitle}</p>
    </div>

    <div className="flex flex-col gap-3 md:gap-4 w-full max-w-sm pb-24 md:pb-0">
      <button onClick={() => { audio.playClick(); onOnline(); }} className="group w-full py-4 md:py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Sword className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_online}</span>
      </button>

      <button onClick={() => { audio.playClick(); onChallenge(); }} className="group w-full py-4 md:py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Clock className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_solo}</span>
      </button>

      <button onClick={() => { audio.playClick(); onPractice(); }} className="group w-full py-4 md:py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Dumbbell className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_practice}</span>
      </button>

      <button onClick={() => { audio.playClick(); onShowAchievements(); }} className="md:hidden w-full py-4 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl border border-slate-100 dark:border-slate-700">
        <Icons.Trophy className="w-5 h-5 text-yellow-500" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_achievements}</span>
      </button>

      <button onClick={() => { audio.playClick(); onShowStats(); }} className="md:hidden w-full py-4 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl border border-slate-100 dark:border-slate-700">
        <Icons.Chart className="w-5 h-5 text-cyan-500" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_stats}</span>
      </button>
    </div>
  </div>
);

// --- Practice Mode V2 ---

const PracticeMode = ({ onBack, t, language, stats, onSaveRecord }: { onBack: () => void, t: any, language: any, stats: UserStats, onSaveRecord: (r: PracticeRecord) => void }) => {
  const [step, setStep] = useState<'LIST' | 'DETAIL' | 'PLAYING' | 'RESULT' | 'HISTORY'>('LIST');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [config, setConfig] = useState<PracticeConfig>(DEFAULT_PRACTICE_CONFIG);
  const [result, setResult] = useState<{ success: boolean; value: number } | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | GameType>('ALL');
  const [search, setSearch] = useState('');
  const [startTime, setStartTime] = useState(0);
  
  // FIXED: Moved Hook to top level (outside of conditional block)
  const [_paused, setPaused] = useState(false);

  // Helper to get PB for current config
  const getPB = (gid: string, cfg: PracticeConfig) => {
    const relevant = stats.practiceRecords.filter(r => 
      r.gameId === gid && 
      r.config.difficulty === cfg.difficulty && 
      r.config.isBattlePreset === cfg.isBattlePreset &&
      r.config.tutorialEnabled === cfg.tutorialEnabled && // Strict check on tutorial
      r.isWin
    );
    if (relevant.length === 0) return null;
    
    // Lower is better for everything since we only track duration mostly
    return relevant.reduce((prev, curr) => prev.value < curr.value ? prev : curr);
  };

  const getPracticeGameMeta = (game: { id: string; name: string; description: string }) => {
    if (language !== 'zh') return { name: game.name, description: game.description };
    const localized = MINI_GAME_ZH_META[game.id];
    return localized ?? { name: game.name, description: game.description };
  };

  const startPractice = () => {
    setStartTime(Date.now());
    setPaused(false); // Reset paused state
    setStep('PLAYING');
  };

  const handleGameComplete = (success: boolean, score?: number) => {
     const endTime = Date.now();
     
     // Default value is time taken (duration), but if game returns a score (like Reaction ms), use that.
     const duration = endTime - startTime;
     const finalValue = score !== undefined ? score : duration;
     
     const record: PracticeRecord = {
        gameId: selectedGameId!,
        timestamp: Date.now(),
        value: finalValue,
        config: { ...config },
        isWin: success
     };

     setResult({ success, value: finalValue });
     if (success) {
        onSaveRecord(record);
     }
     setStep('RESULT');
  };

  const toggleBattlePreset = () => {
     if (!config.isBattlePreset) {
         // Enable Preset: Force Normal Difficulty, Disable Tutorial
         setConfig({ ...config, isBattlePreset: true, difficulty: 'NORMAL', tutorialEnabled: false });
     } else {
         // Disable Preset
         setConfig({ ...config, isBattlePreset: false });
     }
  };

  const updateDifficulty = (d: Difficulty) => {
     setConfig({ ...config, difficulty: d, isBattlePreset: false });
  };

  const toggleTutorial = () => {
      setConfig({ ...config, tutorialEnabled: !config.tutorialEnabled, isBattlePreset: false });
  };

  // --- Screens ---

  // History Dashboard (New)
  if (step === 'HISTORY') {
      const allRecords = [...stats.practiceRecords].sort((a, b) => b.timestamp - a.timestamp);
      
      return (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950 mobile-safe-top">
             <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <button onClick={() => setStep('LIST')} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                    ← Back
                </button>
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">MY PRACTICE</h2>
                <div className="w-16" /> 
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Wins</div>
                        <div className="text-2xl font-black text-green-500">{stats.practiceRecords.filter(r => r.isWin).length}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">Total Attempts</div>
                        <div className="text-2xl font-black text-blue-500">{stats.practiceRecords.length}</div>
                    </div>
                </div>

                <div className="space-y-3">
                    {allRecords.length === 0 ? (
                        <div className="text-center text-slate-400 py-10">No records yet. Go practice!</div>
                    ) : (
                        allRecords.map((r, i) => {
                           const game = MINI_GAMES.find(g => g.id === r.gameId);
                           const meta = game ? getPracticeGameMeta(game) : null;
                           return (
                               <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                   <div className="flex items-center gap-3">
                                       <div className="text-2xl">{game?.icon}</div>
                                       <div>
                                   <div className="font-bold text-sm text-slate-900 dark:text-white">{meta?.name ?? game?.name}</div>
                                           <div className="text-[10px] text-slate-400 font-mono flex gap-2">
                                               <span>{r.config.difficulty}</span>
                                               {r.config.isBattlePreset && <span className="text-blue-500">BATTLE</span>}
                                               {r.config.tutorialEnabled && <span className="text-yellow-500">TUTORIAL</span>}
                                               <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                                           </div>
                                       </div>
                                   </div>
                                   <div className={`font-mono font-bold ${r.isWin ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>
                                       {r.isWin ? (r.gameId === 'reaction' ? `${r.value}ms` : `${(r.value/1000).toFixed(2)}s`) : 'FAIL'}
                                   </div>
                               </div>
                           );
                        })
                    )}
                </div>
             </div>
        </div>
      );
  }

  if (step === 'LIST') {
      const filtered = MINI_GAMES.filter(g => {
        const meta = getPracticeGameMeta(g);
        if (filterType !== 'ALL' && g.type !== filterType) return false;
        if (search && !`${meta.name} ${meta.description}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
     });

     return (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950 mobile-safe-top">
          <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
             <button onClick={onBack} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                ← Back
             </button>
             <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{t.menu_practice}</h2>
             <button onClick={() => setStep('HISTORY')} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-blue-500 transition-colors">
                 <Icons.Trophy className="w-5 h-5" />
             </button>
          </div>

          <div className="p-4 flex gap-2 overflow-x-auto no-scrollbar">
             {['ALL', 'TIMED', 'SCORE', 'ACCURACY'].map(ft => (
                <button 
                  key={ft}
                  onClick={() => setFilterType(ft as any)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${filterType === ft ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
                >
                   {t[`prac_filter_${ft.toLowerCase()}`] || ft}
                </button>
             ))}
          </div>
          
          <div className="px-4 mb-2">
             <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.prac_search}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
             />
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {filtered.map(game => {
                   const meta = getPracticeGameMeta(game);
                   const wins = stats.practiceRecords.filter(r => r.gameId === game.id && r.isWin).length;
                   
                   return (
                     <button 
                        key={game.id}
                        onClick={() => { setSelectedGameId(game.id); setStep('DETAIL'); audio.playClick(); }}
                        className="bg-white dark:bg-slate-900 p-6 rounded-2xl flex items-center gap-6 shadow-sm hover:shadow-lg border border-slate-100 dark:border-slate-800 transition-all text-left group"
                     >
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                           {game.icon}
                        </div>
                        <div className="flex-1">
                           <div className="flex justify-between items-start">
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg">{meta.name}</h3>
                              <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded uppercase">{game.type}</span>
                           </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{meta.description}</p>
                           <div className="mt-3 flex items-center gap-4 text-xs font-mono text-slate-400">
                              <span>Wins: {wins}</span>
                           </div>
                        </div>
                     </button>
                   );
                })}
             </div>
          </div>
       </div>
     );
  }

  if (step === 'DETAIL' && selectedGameId) {
     const game = MINI_GAMES.find(g => g.id === selectedGameId)!;
      const gameMeta = getPracticeGameMeta(game);
     const currentPB = getPB(selectedGameId, config);

     return (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto">
           <div className="min-h-full flex flex-col items-center justify-start md:justify-center p-4 md:p-6 mobile-safe max-w-lg mx-auto w-full animate-fade-in">
              <div className="text-5xl md:text-6xl mb-4 md:mb-6 drop-shadow-lg">{game.icon}</div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2 text-center">{gameMeta.name}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-6 md:mb-8">{gameMeta.description}</p>

              {/* Config Section */}
              <div className="w-full bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-5 md:space-y-6">
                 <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{t.prac_config_title}</span>
                    <span className="text-xs font-mono text-slate-400">ID: {game.id}</span>
                 </div>

                 {/* Settings */}
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <div className="flex flex-col">
                            <span className="text-sm text-slate-500">{t.prac_preset_battle}</span>
                            <span className="text-[10px] text-slate-400">{t.prac_preset_desc}</span>
                       </div>
                       <button 
                          onClick={toggleBattlePreset}
                          className={`w-12 h-6 rounded-full relative transition-colors ${config.isBattlePreset ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                       >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.isBattlePreset ? 'left-7' : 'left-1'}`} />
                       </button>
                    </div>

                    <div className={`flex justify-between items-center transition-opacity ${config.isBattlePreset ? 'opacity-50' : ''}`}>
                       <span className="text-sm text-slate-500">{t.prac_diff}</span>
                       <select 
                          value={config.difficulty}
                          onChange={(e) => updateDifficulty(e.target.value as Difficulty)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold rounded-lg px-3 py-2 outline-none cursor-pointer"
                       >
                          {['EASY', 'NORMAL', 'HARD', 'EXPERT'].map(d => (
                             <option key={d} value={d}>{t[`prac_diff_${d.toLowerCase()}`]}</option>
                          ))}
                       </select>
                    </div>

                    <div className={`flex justify-between items-center transition-opacity ${config.isBattlePreset ? 'opacity-50' : ''}`}>
                       <span className="text-sm text-slate-500">{t.prac_tutorial}</span>
                       <button 
                          onClick={toggleTutorial}
                          className={`w-12 h-6 rounded-full relative transition-colors ${config.tutorialEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                       >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.tutorialEnabled ? 'left-7' : 'left-1'}`} />
                       </button>
                    </div>
                 </div>

                 {/* PB Display */}
                 <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-slate-400">{t.prac_pb}</span>
                    <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">
                       {currentPB ? (selectedGameId === 'reaction' ? `${currentPB.value}ms` : `${(currentPB.value/1000).toFixed(2)}s`) : t.prac_no_pb}
                    </span>
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-2">
                    <button onClick={() => setStep('LIST')} className="py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors uppercase tracking-widest text-sm">{t.settings_close}</button>
                    <button onClick={startPractice} className="py-4 rounded-xl font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95 uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                       <Icons.Play className="w-4 h-4" /> {t.prac_start}
                    </button>
                 </div>
              </div>
           </div>
        </div>
     );
  }

  if (step === 'PLAYING' && selectedGameId) {
    const game = MINI_GAMES.find(g => g.id === selectedGameId)!;
    return (
       <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950 mobile-safe-top">
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-40">
              <button onClick={() => setStep('DETAIL')} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-xs">← Quit</button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 md:p-6">
             <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl relative flex flex-col items-center justify-center w-full max-w-lg max-md:h-[calc(100dvh-5rem)] max-md:max-h-[34rem] max-md:aspect-auto md:aspect-square border border-slate-200 dark:border-slate-800">
                <MiniGameRenderer 
                    type={game.id} 
                    playerId="P1" // Dummy
                    language={language}
                    difficulty={config.difficulty}
                    tutorialEnabled={config.tutorialEnabled}
                    onComplete={(success, score) => handleGameComplete(success, score)}
                />
             </div>
          </div>
       </div>
    );
  }

  if (step === 'RESULT' && result && selectedGameId) {
     const currentPB = getPB(selectedGameId, config);
     const isNewRecord = currentPB && currentPB.value === result.value && result.success;

     return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900 p-6 animate-fade-in">
           <div className="bg-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-700 text-center relative overflow-hidden">
              {isNewRecord && (
                 <div className="absolute top-0 inset-x-0 bg-yellow-500 text-slate-900 font-bold text-xs py-1 tracking-[0.3em] uppercase animate-pulse">
                    {t.prac_new_record}
                 </div>
              )}
              
              <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center text-4xl shadow-lg ${result.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                 {result.success ? '✓' : '✕'}
              </div>
              
              <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">
                 {result.success ? t.prac_res_success : t.prac_res_fail}
              </h2>
              
              <div className="text-5xl font-mono font-bold text-blue-400 mb-8 drop-shadow-sm">
                 {selectedGameId === 'reaction' ? `${result.value}ms` : `${(result.value / 1000).toFixed(2)}s`}
              </div>

              <div className="flex flex-col gap-3">
                 <button onClick={startPractice} className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold uppercase tracking-widest hover:scale-105 transition-transform">
                    {t.prac_restart}
                 </button>
                 <button onClick={() => setStep('DETAIL')} className="w-full bg-slate-700 text-slate-300 py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-600 transition-colors">
                    Back to Config
                 </button>
              </div>
           </div>
        </div>
     );
  }

  return null;
};

// --- Online Lobby ---

const OnlineGuideOverlay = ({
  step,
  totalSteps,
  onBack,
  onNext,
  onSkip,
  onStartTutorial,
  t,
}: {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onStartTutorial: () => void;
  t: any;
}) => {
  const steps = [
    {
      title: t.online_guide_1_title,
      body: t.online_guide_1_body,
      hint: t.online_guide_1_hint,
    },
    {
      title: t.online_guide_2_title,
      body: t.online_guide_2_body,
      hint: t.online_guide_2_hint,
    },
    {
      title: t.online_guide_3_title,
      body: t.online_guide_3_body,
      hint: t.online_guide_3_hint,
    },
    {
      title: t.online_guide_4_title,
      body: t.online_guide_4_body,
      hint: t.online_guide_4_hint,
    },
    {
      title: t.online_guide_5_title,
      body: t.online_guide_5_body,
      hint: t.online_guide_5_hint,
    },
    {
      title: t.online_guide_6_title,
      body: t.online_guide_6_body,
      hint: t.online_guide_6_hint,
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === totalSteps - 1;

  return (
    <div className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200/20 bg-white/95 dark:bg-slate-900/95 shadow-2xl p-6 md:p-7 text-slate-900 dark:text-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-blue-500 mb-2">
              {t.online_guide_step} {step + 1} / {totalSteps}
            </p>
            <h3 className="text-2xl font-black tracking-tight">{currentStep.title}</h3>
          </div>
          <button
            onClick={() => { audio.playClick(); onSkip(); }}
            className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {t.online_guide_skip}
          </button>
        </div>

        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
          {t.online_guide_intro}
        </p>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 md:p-5">
          <p className="text-base leading-relaxed text-slate-700 dark:text-slate-200">{currentStep.body}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {currentStep.hint}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mt-5 mb-6">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-2.5 rounded-full transition-all ${index === step ? 'w-8 bg-blue-500' : 'w-2.5 bg-slate-300 dark:bg-slate-700'}`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => { audio.playClick(); onStartTutorial(); }}
            className="w-full py-3 rounded-xl font-bold uppercase tracking-widest text-sm bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
          >
            {t.online_tutorial_button}
          </button>
          <div className="flex gap-3">
          <button
            onClick={() => { audio.playClick(); onBack(); }}
            disabled={step === 0}
            className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {t.online_guide_back}
          </button>
          <button
            onClick={() => { audio.playClick(); onNext(); }}
            className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-sm bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95"
          >
            {isLastStep ? t.online_guide_done : t.online_guide_next}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const OnlineTutorialCoach = ({ step, t, onExit, onAdvance }: { step: TutorialMatchStep; t: any; onExit: () => void; onAdvance?: () => void }) => {
  const steps: Record<Exclude<TutorialMatchStep, 'NONE'>, { title: string; body: string }> = {
    CLICK_CENTER: { title: t.online_tutorial_step_1_title, body: t.online_tutorial_step_1_body },
    CENTER_MINIGAME: { title: t.online_tutorial_step_2_title, body: t.online_tutorial_step_2_body },
    WATCH_BOT_CAPTURE: { title: t.online_tutorial_step_3_title, body: t.online_tutorial_step_3_body },
    BOT_CAPTURING: { title: t.online_tutorial_step_4_title, body: t.online_tutorial_step_4_body },
    PREPARE_FREEZE: { title: t.online_tutorial_step_5_title, body: t.online_tutorial_step_5_body },
    USE_FREEZE: { title: t.online_tutorial_step_6_title, body: t.online_tutorial_step_6_body },
    RACE_TOP_RIGHT: { title: t.online_tutorial_step_7_title, body: t.online_tutorial_step_7_body },
    STEAL_TOP_LEFT: { title: t.online_tutorial_step_8_title, body: t.online_tutorial_step_8_body },
    STEAL_CONTEST: { title: t.online_tutorial_step_9_title, body: t.online_tutorial_step_9_body },
    CLAIM_FINAL_CELL: { title: t.online_tutorial_step_10_title, body: t.online_tutorial_step_10_body },
    FINAL_MINIGAME: { title: t.online_tutorial_step_11_title, body: t.online_tutorial_step_11_body },
    VICTORY: { title: t.online_tutorial_step_12_title, body: t.online_tutorial_step_12_body },
  };

  if (step === 'NONE') return null;
  const current = steps[step];

  return (
    <div className="absolute top-24 left-4 z-[55] max-w-sm w-[calc(100%-2rem)] md:w-96 rounded-3xl border border-emerald-200 dark:border-emerald-900/60 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-emerald-500 mb-1">{t.online_tutorial_label}</p>
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{current.title}</h3>
        </div>
        <button onClick={() => { audio.playClick(); onExit(); }} className="text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          {t.online_tutorial_exit}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{current.body}</p>
      {onAdvance && (
        <button
          onClick={() => { audio.playClick(); onAdvance(); }}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-95"
        >
          {t.online_tutorial_continue}
        </button>
      )}
    </div>
  );
};

const OnlineLobby = ({ onCreate, onJoin, onBack, onStartTutorial, isConnecting, error, t, guidesEnabled = true }: any) => {
  const ONLINE_GUIDE_SEEN_KEY = 'gridrush_online_guide_seen_v2';
  const GUIDE_STEPS = 6;
  const [joinId, setJoinId] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('STANDARD');
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  const markGuideSeen = () => {
    try {
      localStorage.setItem(ONLINE_GUIDE_SEEN_KEY, '1');
    } catch {
      // Ignore storage failures; guide just shows again next time.
    }
  };

  const closeGuide = (remember = true) => {
    if (remember) markGuideSeen();
    setShowGuide(false);
    setGuideStep(0);
  };

  const openGuide = () => {
    setGuideStep(0);
    setShowGuide(true);
  };

  useEffect(() => {
    if (!guidesEnabled) return;
    try {
      if (localStorage.getItem(ONLINE_GUIDE_SEEN_KEY) !== '1') {
        setShowGuide(true);
      }
    } catch {
      setShowGuide(true);
    }
  }, [guidesEnabled]);

  const modeGuideActive = showGuide && guideStep === 1;
  const createJoinGuideActive = showGuide && guideStep === 2;
  const summaryGuideActive = showGuide && (guideStep === 0 || guideStep >= 3);

  return (
    <div className="absolute inset-0 z-20 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-start md:justify-center p-4 md:p-6 mobile-safe overflow-y-auto">
      <button onClick={() => { audio.playClick(); onBack(); }} className="absolute top-4 left-4 md:top-6 md:left-6 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-widest text-xs">← Back</button>
      <button onClick={() => { audio.playClick(); openGuide(); }} className="absolute top-4 right-4 md:top-6 md:right-6 px-3 md:px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-lg text-slate-600 dark:text-slate-200 hover:scale-105 transition-all text-xs font-bold uppercase tracking-widest">
        ? {t.online_guide_open}
      </button>
      
      <h2 className="mt-16 md:mt-0 text-3xl md:text-4xl font-black mb-6 md:mb-10 text-slate-900 dark:text-white uppercase tracking-tighter">{t.menu_online}</h2>
      
      {isConnecting ? (
        <div className="flex flex-col items-center animate-fade-in">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-6"></div>
          <p className="text-slate-500 dark:text-slate-400 font-mono text-sm tracking-widest animate-pulse">{t.online_connecting}</p>
        </div>
      ) : (
        <div className={`flex flex-col gap-4 md:gap-6 w-full max-w-2xl items-stretch animate-fade-in ${summaryGuideActive ? 'rounded-3xl ring-4 ring-emerald-400/70 shadow-2xl shadow-emerald-500/10' : ''}`}>
          {/* Mode Selector */}
          <div className={`bg-white dark:bg-slate-800 rounded-2xl p-3 md:p-4 shadow-lg border border-slate-200 dark:border-slate-700 transition-all ${modeGuideActive ? 'ring-4 ring-blue-400/70 shadow-2xl shadow-blue-500/20' : ''}`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 text-center">{t.online_mode_label ?? 'GAME MODE'}</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setGameMode('STANDARD')}
                className={`flex-1 py-3 px-3 md:px-4 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider transition-all active:scale-95 ${
                  gameMode === 'STANDARD'
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                ⚔️ {t.std_mode}
              </button>
              <button
                onClick={() => setGameMode('FUN')}
                className={`flex-1 py-3 px-3 md:px-4 rounded-xl font-bold text-xs md:text-sm uppercase tracking-wider transition-all active:scale-95 ${
                  gameMode === 'FUN'
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                🎉 {t.fun_mode}
              </button>
            </div>
            <p className="text-xs text-slate-400 text-center mt-2">{gameMode === 'FUN' ? t.fun_mode_desc : t.std_mode_desc}</p>
          </div>

          <button
            onClick={() => { audio.playClick(); onStartTutorial(); }}
            className={`w-full rounded-2xl px-5 py-4 text-left bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-xl transition-all active:scale-[0.99] ${modeGuideActive ? 'ring-4 ring-emerald-300/80 shadow-2xl shadow-emerald-500/30' : 'hover:shadow-2xl hover:scale-[1.01]'}`}
          >
            <div className="text-xs font-black uppercase tracking-[0.35em] opacity-90 mb-2">{t.online_tutorial_label}</div>
            <div className="text-lg font-black tracking-wide mb-1">{t.online_tutorial_button}</div>
            <p className="text-sm text-white/90 leading-relaxed">{t.online_tutorial_desc}</p>
          </button>

          {/* HOST / JOIN cards */}
          <div className={`flex flex-col md:flex-row gap-4 md:gap-6 transition-all ${createJoinGuideActive ? 'rounded-3xl ring-4 ring-amber-400/70 shadow-2xl shadow-amber-500/20' : ''}`}>
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 p-5 md:p-8 rounded-2xl flex flex-col items-center shadow-lg border-2 border-transparent hover:border-blue-500 transition-colors">
              <h3 className="text-lg font-bold mb-2 text-blue-500 uppercase tracking-widest">{t.online_host}</h3>
              <p className="text-xs text-slate-400 text-center mb-5 md:mb-8 md:h-8">{t.online_host_desc}</p>
              <button onClick={() => { audio.playClick(); onCreate(gameMode); }} className="w-full py-4 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-blue-500/30 text-white transition-all active:scale-95">{t.online_create}</button>
            </div>
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 p-5 md:p-8 rounded-2xl flex flex-col items-center shadow-lg border-2 border-transparent hover:border-red-500 transition-colors">
              <h3 className="text-lg font-bold mb-2 text-red-500 uppercase tracking-widest">{t.online_join}</h3>
              <p className="text-xs text-slate-400 text-center mb-5 md:mb-8 md:h-8">{t.online_join_desc}</p>
              <div className="flex w-full gap-2">
                <input value={joinId} onChange={(e) => setJoinId(e.target.value.toUpperCase().slice(0, 4))} placeholder="CODE" className="min-w-0 flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-red-500 rounded-xl px-4 text-center font-mono text-xl focus:outline-none uppercase text-slate-900 dark:text-white placeholder-slate-400 transition-colors" />
                <button onClick={() => { audio.playClick(); onJoin(joinId, gameMode); }} disabled={joinId.length !== 4} className="shrink-0 px-4 md:px-6 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-red-500/30 transition-all active:scale-95">{t.online_join_btn}</button>
              </div>
            </div>
          </div>

          <p className={`text-[10px] text-slate-400 text-center max-w-md mx-auto transition-all ${summaryGuideActive ? 'text-emerald-500 dark:text-emerald-300 font-bold' : ''}`}>{t.online_instruction}</p>
        </div>
      )}
      {error && <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 px-6 py-3 rounded-lg text-sm border border-red-200 dark:border-red-800">{error}</div>}
      {showGuide && !isConnecting && (
        <OnlineGuideOverlay
          step={guideStep}
          totalSteps={GUIDE_STEPS}
          onBack={() => setGuideStep(prev => Math.max(0, prev - 1))}
          onNext={() => {
            if (guideStep >= GUIDE_STEPS - 1) {
              closeGuide(true);
              return;
            }
            setGuideStep(prev => prev + 1);
          }}
          onSkip={() => closeGuide(true)}
          onStartTutorial={() => {
            closeGuide(true);
            onStartTutorial();
          }}
          t={t}
        />
      )}
    </div>
  );
};

const WaitingRoom = ({ roomId, onCancel, t }: {
  roomId: string, onCancel: () => void, t: any,
}) => {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const handleCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?join=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      audio.playClick();
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="absolute inset-0 z-20 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 md:p-6 mobile-safe">
      <div className="bg-white dark:bg-slate-800 p-6 md:p-10 rounded-3xl flex flex-col items-center max-w-md w-full animate-fade-in shadow-2xl">
        <h2 className="text-slate-400 mb-4 text-xs font-mono uppercase tracking-widest">Room Code</h2>
        <div className="text-5xl md:text-6xl font-mono font-bold tracking-widest text-slate-900 dark:text-white mb-8 select-all cursor-pointer bg-slate-100 dark:bg-slate-900 px-6 md:px-8 py-5 md:py-6 rounded-2xl border border-slate-200 dark:border-slate-700">{roomId}</div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-blue-500 text-sm font-medium tracking-wide">{t.online_waiting}</span>
        </div>
        <button
          onClick={handleCopyLink}
          className={`mb-3 w-full px-5 py-3 rounded-xl text-sm font-bold tracking-widest uppercase transition-all active:scale-95 ${
            linkCopied
              ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          }`}
        >
          {linkCopied ? t.invite_link_copied : `🔗 ${t.invite_copy_link}`}
        </button>
        <button onClick={() => { audio.playClick(); onCancel(); }} className="text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs uppercase tracking-widest transition-colors">Cancel</button>
      </div>
    </div>
  );
};

const PlayerBadge = ({ player, isMe, opponent, t, onFreeze, onDuel, oppInGame, onUseFunCard, highlightFreeze }: {
  player: PlayerState, isMe: boolean, opponent?: boolean, t: any,
  onFreeze?: () => void, onDuel?: () => void, oppInGame?: boolean,
  onUseFunCard?: (cardId: FunCardId) => void,
  highlightFreeze?: boolean,
}) => {
  const colorClass = player.id === 'P1' ? 'text-blue-500' : 'text-red-500';
  const borderClass = player.id === 'P1' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-red-500 bg-red-50 dark:bg-red-900/20';
  
  // Cooldown status
  const cooldownEnd = player.stealCooldown > Date.now() ? player.stealCooldown : 0;
  const isCooldown = cooldownEnd > 0;
  const isFrozen = player.frozenUntil > Date.now();
  
  return (
    <div className={`flex min-w-0 items-center gap-2 md:gap-4 ${opponent ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl border-2 ${borderClass} flex shrink-0 items-center justify-center text-sm md:text-xl font-bold shadow-sm relative overflow-hidden`}>
         {isCooldown && (
             <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-[10px] font-bold text-white z-10 backdrop-blur-sm">
                 {Math.ceil((cooldownEnd - Date.now())/1000)}s
             </div>
         )}
         {isFrozen && (
             <div className="absolute inset-0 bg-blue-500/60 flex items-center justify-center text-xl z-10">
                 ❄️
             </div>
         )}
        <span className={player.id === 'P1' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}>
            {player.id === 'P1' ? 'P1' : 'P2'}
        </span>
      </div>
      <div className="min-w-0">
        <div className={`font-bold ${colorClass} text-sm md:text-lg tracking-wide truncate max-w-[5.5rem] md:max-w-none`}>{isMe ? t.game_you : player.name}</div>
        <div className="flex flex-wrap gap-1 mt-1 max-md:max-w-[8rem] max-md:overflow-hidden">
          {/* Steal — only visible to self */}
          {isMe && player.stealsRemaining > 0 && (
            <span className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-bold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-300">
              ⭐ {t.skill_steal}
            </span>
          )}
          {/* Freeze skill button — only for my own badge, only if selected */}
          {isMe && onFreeze && player.freezesRemaining > 0 && (
            <button
              onClick={onFreeze}
              disabled={!oppInGame}
              title={!oppInGame ? 'Opponent not in game' : 'Freeze opponent for 2s'}
              className={`flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-bold transition-all ${
                oppInGame
                  ? `bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 cursor-pointer active:scale-95 ${highlightFreeze ? 'ring-4 ring-emerald-400 animate-pulse' : ''}`
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-40'
              }`}
            >
              ❄️ {t.skill_freeze}
            </button>
          )}
          {/* Duel skill button — only if selected */}
          {isMe && onDuel && player.duelsRemaining > 0 && (
            <button
              onClick={onDuel}
              title="Force a duel — pick an empty cell to race!"
              className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-bold bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800 cursor-pointer active:scale-95 transition-all"
            >
              ⚔️ {t.skill_duel}
            </button>
          )}
          {/* Fallback — only shown to self when all skills used */}
          {isMe && player.stealsRemaining <= 0 && player.freezesRemaining <= 0 && player.duelsRemaining <= 0 && !player.funCardInHand && (
            <span className="text-[10px] md:text-xs text-slate-400 opacity-50">{t.game_no_steal}</span>
          )}
          {/* Fun card in hand */}
          {isMe && player.funCardInHand && onUseFunCard && (() => {
            const card = FUN_CARDS.find(c => c.id === player.funCardInHand);
            return card ? (
              <button
                onClick={() => onUseFunCard(player.funCardInHand!)}
                title={t[card.descKey as keyof typeof t] as string ?? card.descKey}
                className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 cursor-pointer active:scale-95 transition-all animate-pulse"
              >
                {card.icon} {t[card.nameKey as keyof typeof t] as string ?? card.nameKey}
              </button>
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
};

// --- Skill Pick Screen ---

const SKILL_DEFS = [
  { id: 'STEAL',  icon: '⭐', nameKey: 'skill_steal'  as const },
  { id: 'FREEZE', icon: '❄️',  nameKey: 'skill_freeze' as const },
  { id: 'DUEL',   icon: '⚔️',  nameKey: 'skill_duel'   as const },
];
const ALL_MINI_GAME_IDS = MINI_GAMES.map(g => g.id);

// --- Rock-Paper-Scissors ---

type RpsResult = 'WIN' | 'LOSE' | 'DRAW';
type RpsSeriesWinner = 'ME' | 'OPP' | 'DRAW';
type RematchUiStatus = 'NONE' | 'REQUEST_SENT' | 'WAIT_HOST' | 'DECLINED';
type AuthMode = 'SIGN_IN' | 'SIGN_UP';
type TutorialMatchStep =
  | 'NONE'
  | 'CLICK_CENTER'
  | 'CENTER_MINIGAME'
  | 'WATCH_BOT_CAPTURE'
  | 'BOT_CAPTURING'
  | 'PREPARE_FREEZE'
  | 'USE_FREEZE'
  | 'RACE_TOP_RIGHT'
  | 'STEAL_TOP_LEFT'
  | 'STEAL_CONTEST'
  | 'CLAIM_FINAL_CELL'
  | 'FINAL_MINIGAME'
  | 'VICTORY';

interface RpsDisplayState {
  round: number;
  myScore: number;
  oppScore: number;
  myMove: RpsMove | null;
  oppMove: RpsMove | null;
  roundResult: RpsResult | null;
  seriesWinner: RpsSeriesWinner | null;
}

interface NetworkQualityState {
  rttMs: number | null;
  jitterMs: number | null;
  lossPct: number;
  phase: MatchPhase;
  revision: number;
}

const RPS_ICONS: Record<RpsMove, string> = { R: '✊', P: '✋', S: '✌️' };
const MATCH_PHASE_LABEL_KEY: Record<MatchPhase, string> = {
  WAITING: 'net_phase_waiting',
  BAN_PICK: 'net_phase_ban',
  SKILL_PICK: 'net_phase_skills',
  RPS: 'net_phase_rps',
  PLAYING: 'net_phase_playing',
  RESULT: 'net_phase_result',
};

function getRpsRoundWinner(p1: RpsMove, p2: RpsMove): 'P1' | 'P2' | 'DRAW' {
  if (p1 === p2) return 'DRAW';
  if ((p1 === 'R' && p2 === 'S') || (p1 === 'P' && p2 === 'R') || (p1 === 'S' && p2 === 'P')) return 'P1';
  return 'P2';
}

const RpsScreen: React.FC<{
  t: Record<string, string>;
  state: RpsDisplayState;
  onPick: (move: RpsMove) => void;
}> = ({ t, state, onPick }) => {
  const moves: RpsMove[] = ['R', 'P', 'S'];
  const moveLabels = [t.rps_rock, t.rps_paper, t.rps_scissors];
  const showButtons = !state.myMove && !state.seriesWinner;
  const showWaiting = !!state.myMove && !state.roundResult && !state.seriesWinner;

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 md:gap-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 mobile-safe overflow-y-auto">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-widest uppercase text-yellow-500 dark:text-yellow-400">{t.rps_title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.rps_instr}</p>
      </div>

      {/* Scoreboard */}
      <div className="flex gap-6 md:gap-10 items-center text-center">
        <div>
          <div className="text-4xl md:text-5xl font-black">{state.myScore}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-1">{t.rps_you}</div>
        </div>
        <div className="text-slate-400 dark:text-slate-500 font-bold text-sm">{t.rps_round} {state.round} / 3</div>
        <div>
          <div className="text-4xl md:text-5xl font-black">{state.oppScore}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-1">{t.rps_opp}</div>
        </div>
      </div>

      {/* Round result reveal */}
      {state.roundResult && state.oppMove && (
        <div className="flex flex-col items-center gap-3 p-4 md:p-6 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex gap-5 md:gap-8 items-center">
            <div className="text-center">
              <div className="text-5xl md:text-6xl">{RPS_ICONS[state.myMove!]}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.rps_you}</div>
            </div>
            <div className="text-xl font-black text-slate-400">VS</div>
            <div className="text-center">
              <div className="text-5xl md:text-6xl">{RPS_ICONS[state.oppMove]}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.rps_opp}</div>
            </div>
          </div>
          <div className={`font-black text-xl tracking-widest ${
            state.roundResult === 'WIN'  ? 'text-green-500' :
            state.roundResult === 'LOSE' ? 'text-red-500' :
                                           'text-slate-400 dark:text-slate-300'
          }`}>
            {state.roundResult === 'WIN'  ? t.rps_you_win :
             state.roundResult === 'LOSE' ? t.rps_you_lose :
                                            t.rps_draw}
          </div>
        </div>
      )}

      {/* Series final result */}
      {state.seriesWinner && (
        <div className={`text-center font-black text-xl px-6 py-3 rounded-full border ${
          state.seriesWinner === 'ME'   ? 'bg-green-500/10 text-green-400 border-green-500/40' :
          state.seriesWinner === 'DRAW' ? 'bg-slate-500/10 text-slate-400 border-slate-500/40' :
                                          'bg-red-500/10 text-red-400 border-red-500/40'
        }`}>
          {state.seriesWinner === 'ME'   ? t.rps_headstart_win :
           state.seriesWinner === 'DRAW' ? t.rps_headstart_draw :
                                           t.rps_headstart_lose}
        </div>
      )}

      {/* Move picker */}
      {showButtons && (
        <div className="flex gap-3 md:gap-4">
          {moves.map((move, i) => (
            <button
              key={move}
              onClick={() => onPick(move)}
              className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-yellow-400 hover:bg-yellow-400/5 hover:scale-110 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
            >
              <span className="text-4xl md:text-5xl">{RPS_ICONS[move]}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{moveLabels[i]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Pick confirmed, showing your choice */}
      {state.myMove && !state.roundResult && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-6xl">{RPS_ICONS[state.myMove]}</div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t.rps_you_picked}</p>
        </div>
      )}

      {/* Waiting spinner */}
      {showWaiting && (
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span className="animate-spin text-lg">⏳</span>
          <span>{t.rps_waiting}</span>
        </div>
      )}
    </div>
  );
};

const NetworkQualityPanel = ({
  t,
  status,
  quality,
  reconnectAttempt,
}: {
  t: Record<string, string>;
  status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  quality: NetworkQualityState;
  reconnectAttempt: number;
}) => {
  const dotClass = status === 'CONNECTED'
    ? 'bg-green-500'
    : status === 'RECONNECTING'
      ? 'bg-amber-500'
      : 'bg-red-500';

  const phaseLabel = t[MATCH_PHASE_LABEL_KEY[quality.phase]] ?? quality.phase;
  const fmtMs = (value: number | null) => value === null ? '--' : `${Math.round(value)}ms`;
  const fmtPct = `${Math.round(quality.lossPct)}%`;

  return (
    <div className="mt-2 min-w-[250px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotClass} ${status !== 'DISCONNECTED' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-black tracking-[0.25em] uppercase text-slate-500 dark:text-slate-400">{t.net_quality}</span>
        </div>
        {status === 'RECONNECTING' && reconnectAttempt > 0 && (
          <span className="text-[10px] font-mono text-amber-500">{t.conn_attempt} {reconnectAttempt}</span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{t.net_rtt}</div>
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{fmtMs(quality.rttMs)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{t.net_jitter}</div>
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{fmtMs(quality.jitterMs)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{t.net_loss}</div>
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{fmtPct}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{t.net_revision}</div>
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{quality.revision}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-slate-400">{t.net_phase}</div>
          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{phaseLabel}</div>
        </div>
      </div>
    </div>
  );
};

interface SkillPickScreenProps {
  t: Record<string, string>;
  waiting: boolean;
  onConfirm: (picks: string[]) => void;
}

interface BanPickScreenProps {
  t: Record<string, string>;
  language: 'en' | 'zh';
  waiting: boolean;
  selectedGameId: string | null;
  onConfirm: (gameId: string) => void;
}

const BanPickScreen: React.FC<BanPickScreenProps> = ({ t, language, waiting, selectedGameId, onConfirm }) => {
  const [selected, setSelected] = React.useState<string | null>(selectedGameId);

  React.useEffect(() => {
    setSelected(selectedGameId);
  }, [selectedGameId]);

  const selectedGame = React.useMemo(
    () => MINI_GAMES.find(game => game.id === (selected ?? selectedGameId ?? '')),
    [selected, selectedGameId],
  );

  const getName = (id: string, fallback: string) => {
    if (language !== 'zh') return fallback;
    return MINI_GAME_ZH_META[id]?.name ?? fallback;
  };

  if (waiting) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 mobile-safe">
        <div className="text-5xl animate-spin">⏳</div>
        <p className="text-xl font-bold tracking-widest uppercase text-slate-500 dark:text-slate-300">{t.ban_pick_waiting}</p>
        {selectedGame && (
          <div className="px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold tracking-wide">
            {t.ban_pick_selected}: {selectedGame.icon} {getName(selectedGame.id, selectedGame.name)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-start md:justify-center gap-5 md:gap-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 py-6 mobile-safe overflow-y-auto">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-widest uppercase text-rose-500 dark:text-rose-400 mb-2">{t.ban_pick_title}</h1>
        <p className="text-slate-500 dark:text-slate-400">{t.ban_pick_instr}</p>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-3">
        {MINI_GAMES.map(game => {
          const isSelected = selected === game.id;
          return (
            <button
              key={game.id}
              onClick={() => setSelected(game.id)}
              className={`rounded-2xl border-2 px-3 py-4 flex flex-col items-center gap-2 text-center transition-all duration-200 ${
                isSelected
                  ? 'border-rose-400 bg-rose-400/10 shadow-lg shadow-rose-400/20 scale-105'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500 hover:scale-105'
              }`}
            >
              <span className="text-3xl">{game.icon}</span>
              <span className="text-xs font-bold tracking-wide leading-tight">{getName(game.id, game.name)}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => selected && onConfirm(selected)}
        disabled={!selected}
        className={`px-10 py-4 rounded-full font-black tracking-widest uppercase text-lg transition-all duration-200 ${
          selected
            ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-lg shadow-rose-500/30 hover:scale-105'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
        }`}
      >
        {t.ban_pick_confirm}
      </button>
    </div>
  );
};

const SkillPickScreen: React.FC<SkillPickScreenProps> = ({ t, waiting, onConfirm }) => {
  const [selected, setSelected] = React.useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  if (waiting) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 mobile-safe">
        <div className="text-5xl animate-spin">⏳</div>
        <p className="text-xl font-bold tracking-widest uppercase text-slate-500 dark:text-slate-300">{t.skill_pick_waiting}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-start md:justify-center gap-5 md:gap-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4 py-6 mobile-safe overflow-y-auto">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-widest uppercase text-yellow-500 dark:text-yellow-400 mb-2">{t.skill_pick_title}</h1>
        <p className="text-slate-500 dark:text-slate-400">{t.skill_pick_instr}</p>
      </div>

      <div className="flex gap-4 flex-wrap justify-center">
        {SKILL_DEFS.map(skill => {
          const isSelected = selected.includes(skill.id);
          const isDisabled = !isSelected && selected.length >= 2;
          return (
            <button
              key={skill.id}
              onClick={() => toggle(skill.id)}
              disabled={isDisabled}
              className={`w-32 h-40 md:w-36 md:h-44 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 font-bold transition-all duration-200
                ${isSelected
                  ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/30 scale-105'
                  : isDisabled
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-100/40 dark:bg-slate-800/40 opacity-40 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-400 hover:scale-105 cursor-pointer'
                }`}
            >
              <span className="text-5xl">{skill.icon}</span>
              <span className="text-sm tracking-wider uppercase text-slate-700 dark:text-slate-100">{t[skill.nameKey] ?? skill.id}</span>
              {isSelected && <span className="text-xs text-yellow-500 dark:text-yellow-400 font-black">✓ SELECTED</span>}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onConfirm(selected)}
        disabled={selected.length !== 2}
        className={`px-10 py-4 rounded-full font-black tracking-widest uppercase text-lg transition-all duration-200
          ${selected.length === 2
            ? 'bg-yellow-400 text-slate-900 hover:bg-yellow-300 shadow-lg shadow-yellow-400/40 hover:scale-105'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
      >
        {t.skill_pick_confirm} ({selected.length}/2)
      </button>
    </div>
  );
};

// --- Solo Difficulty Picker ---

const SoloDifficultyPicker = ({
  t, stats, onStart, onBack,
}: {
  t: any;
  stats: UserStats;
  onStart: (diff: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT') => void;
  onBack: () => void;
}) => {
  const [selected, setSelected] = useState<'EASY' | 'NORMAL' | 'HARD' | 'EXPERT'>('NORMAL');

  const opts: { id: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT'; label: string; desc: string; border: string; text: string }[] = [
    { id: 'EASY',   label: t.solo_diff_easy,   desc: t.solo_diff_desc_easy,   border: 'border-green-500',  text: 'text-green-400'  },
    { id: 'NORMAL', label: t.solo_diff_normal,  desc: t.solo_diff_desc_normal, border: 'border-blue-500',   text: 'text-blue-400'   },
    { id: 'HARD',   label: t.solo_diff_hard,    desc: t.solo_diff_desc_hard,   border: 'border-orange-500', text: 'text-orange-400' },
    { id: 'EXPERT', label: t.solo_diff_expert,  desc: t.solo_diff_desc_expert, border: 'border-red-500',    text: 'text-red-400'    },
  ];

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-start md:justify-center p-4 md:p-6 mobile-safe overflow-y-auto">
      <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-slate-900 dark:text-white mb-1 text-center">{t.solo_diff_title}</h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 md:mb-8 text-center">{t.solo_diff_instr}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-6 md:mb-8">
        {opts.map(o => {
          const best = stats.soloRunsByDiff?.[o.id];
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => { audio.playClick(); setSelected(o.id); }}
              className={`p-3 md:p-4 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? `${o.border} bg-slate-100 dark:bg-slate-800 ${o.text}`
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <div className="text-base font-black uppercase tracking-wider">{o.label}</div>
              <div className="text-xs font-normal opacity-70 mt-1 leading-snug">{o.desc}</div>
              {best ? (
                <div className="text-xs mt-2 font-mono opacity-90">{t.solo_diff_best} {fmt(best)}</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 md:gap-4">
        <button
          onClick={() => { audio.playClick(); onBack(); }}
          className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold uppercase tracking-widest transition-colors"
        >
          {t.solo_diff_back}
        </button>
        <button
          onClick={() => { audio.playClick(); onStart(selected); }}
          className="px-8 py-3 rounded-xl bg-yellow-400 text-slate-900 font-black uppercase tracking-widest hover:bg-yellow-300 transition-colors"
        >
          {t.solo_diff_start}
        </button>
      </div>
    </div>
  );
};

// --- App ---

export default function App() {
  const [appMode, setAppMode] = useState<'MENU' | 'LOBBY' | 'PRACTICE' | 'CHALLENGE' | 'GAME' | 'BAN_PICK' | 'SKILL_PICK' | 'SOLO_DIFFICULTY' | 'RPS'>('MENU');
  
  // Persisted State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);
  const [localPersistenceReady, setLocalPersistenceReady] = useState(false);

  // Game State
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const [myId, setMyId] = useState<PlayerId | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTED');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [networkQuality, setNetworkQuality] = useState<NetworkQualityState>({
    rttMs: null,
    jitterMs: null,
    lossPct: 0,
    phase: 'WAITING',
    revision: 0,
  });
  const [, setMatchPhase] = useState<MatchPhase>('WAITING');
  
  // Time Sync
  const timeOffsetRef = useRef<number>(0);
  
  // Modals
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('SIGN_IN');
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('LOCAL_ONLY');
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialMatchStep>('NONE');

  // Ban phase (online only)
  const [myBanPick, setMyBanPick] = useState<string | null>(null);
  const myBanPickRef = useRef<string | null>(null);
  myBanPickRef.current = myBanPick;
  const p2BanPickRef = useRef<string | null>(null); // HOST stores P2's banned game

  // Skill pick phase (online only)
  const [mySkillPicks, setMySkillPicks] = useState<string[]>([]);
  const mySkillPicksRef = useRef<string[]>([]);
  mySkillPicksRef.current = mySkillPicks;
  const p2SkillPicksRef = useRef<string[] | null>(null); // HOST stores P2's picks

  // Rock-Paper-Scissors phase (online only)
  const rpsMyPickRef  = useRef<RpsMove | null>(null); // HOST's current-round move
  const rpsP2PickRef  = useRef<RpsMove | null>(null); // P2's current-round move (HOST only)
  const rpsScoresRef  = useRef<{ P1: number; P2: number }>({ P1: 0, P2: 0 });
  const rpsRoundRef   = useRef<number>(1);
  const [rpsState, setRpsState] = useState<RpsDisplayState>({
    round: 1, myScore: 0, oppScore: 0,
    myMove: null, oppMove: null, roundResult: null, seriesWinner: null,
  });
  const [rematchInviteFrom, setRematchInviteFrom] = useState<PlayerId | null>(null);
  const [rematchStatus, setRematchStatus] = useState<RematchUiStatus>('NONE');

  // Challenge
  const [challengeStartTime, setChallengeStartTime] = useState<number>(0);
  const [challengeTime, setChallengeTime] = useState<string>("00:00");
  const soloDifficultyRef = useRef<'EASY' | 'NORMAL' | 'HARD' | 'EXPERT'>('NORMAL');
  
  // Refs
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const transportRef = useRef<'NONE' | 'PEER' | 'SUPABASE'>('NONE');
  const relayChannelRef = useRef<any>(null);
  const relayConnMapRef = useRef<Record<string, any>>({});
  const relayClientIdRef = useRef<string>(createRelayClientId());
  const relayGuestIdRef = useRef<string | null>(null);
  const roleRef = useRef<'HOST' | 'GUEST' | 'SOLO' | 'NONE'>('NONE');
  const roomIdRef = useRef<string | null>(null);
  const guestSessionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const hostReconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hostReconnectAttemptRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const matchPhaseRef = useRef<MatchPhase>('WAITING');
  const authorityRevisionRef = useRef(0);
  const lastAppliedAuthorityRevisionRef = useRef(0);
  const guestActionSeqRef = useRef(0);
  const lastGuestActionSeqRef = useRef(0);
  const guestActionHistoryRef = useRef<string[]>([]);
  const guestActionIdsRef = useRef<Set<string>>(new Set());
  const pendingPingRef = useRef<{ pingId: string; timeoutId: number } | null>(null);
  const pingWindowRef = useRef<boolean[]>([]);
  const lastRttSampleRef = useRef<number | null>(null);
  const jitterRef = useRef<number | null>(null);
  const lastPacketTime = useRef<number>(Date.now()); // Track last data from other peer
  const guestRateLimiter = useRef(new RateLimiter());
  const [, setTick] = useState(0);
  const gameModeRef = useRef<GameMode>('STANDARD');
  const suppressNextSyncRef = useRef(false); // Suppresses STATE_UPDATE on heartbeat-only setGameState calls
  const cloudHydratedRef = useRef(false);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const statsRef = useRef<UserStats>(DEFAULT_STATS);
  statsRef.current = stats;
  const pendingInviteCodeRef = useRef<string | null>(null);
  const tutorialActiveRef = useRef(false);
  tutorialActiveRef.current = tutorialActive;
  const tutorialBotTimersRef = useRef<number[]>([]);
  const tutorialScriptRef = useRef({
    botCaptureStarted: false,
    prepareFreezeShown: false,
    topRightRaceStarted: false,
    stealDefendQueued: false,
    completed: false,
  });

  // Helpers
  const t = TRANSLATIONS[settings.language];
  const MAX_GUEST_RECONNECT_ATTEMPTS = 6;
  const MAX_HOST_RECONNECT_ATTEMPTS = 8;
  const GUEST_RESUME_STORAGE_KEY = 'gridrush_guest_resume';
  const HOST_RESUME_STORAGE_KEY = 'gridrush_host_resume';
  const ONLINE_TUTORIAL_DONE_KEY = 'gridrush_online_tutorial_done';
  const RULES_MODAL_SEEN_KEY = 'gridrush_rules_modal_seen_v2';

  const getOnlineAllowedGameIds = () => {
    const banned = new Set<string>();
    if (myBanPickRef.current) banned.add(myBanPickRef.current);
    if (p2BanPickRef.current) banned.add(p2BanPickRef.current);
    const allowed = ALL_MINI_GAME_IDS.filter(id => !banned.has(id));
    // Safety fallback in case future game count drops below board size.
    return allowed.length >= 9 ? allowed : ALL_MINI_GAME_IDS;
  };

  const getOnlineBoardGameIds = () => shuffleGames(getOnlineAllowedGameIds()).slice(0, 9);

  const setMatchPhaseLocal = (phase: MatchPhase) => {
    const phaseChanged = matchPhaseRef.current !== phase;
    matchPhaseRef.current = phase;
    setMatchPhase(phase);
    setNetworkQuality(prev => ({
      ...prev,
      phase,
      revision: phaseChanged ? prev.revision + 1 : prev.revision,
    }));
  };

  const setMatchPhaseAndUi = (phase: MatchPhase) => {
    setMatchPhaseLocal(phase);
    if (phase === 'WAITING' && roleRef.current === 'HOST') setAppMode('GAME');
    if (phase === 'BAN_PICK') setAppMode('BAN_PICK');
    if (phase === 'SKILL_PICK') setAppMode('SKILL_PICK');
    if (phase === 'RPS') setAppMode('RPS');
    if (phase === 'PLAYING' || phase === 'RESULT') setAppMode('GAME');
  };

  const nextAuthorityRevision = () => {
    authorityRevisionRef.current += 1;
    return authorityRevisionRef.current;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearHostReconnectTimer = () => {
    if (hostReconnectTimerRef.current !== null) {
      window.clearTimeout(hostReconnectTimerRef.current);
      hostReconnectTimerRef.current = null;
    }
  };

  const clearPendingPing = () => {
    if (pendingPingRef.current) {
      window.clearTimeout(pendingPingRef.current.timeoutId);
      pendingPingRef.current = null;
    }
  };

  const clearTutorialBotTimers = () => {
    tutorialBotTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    tutorialBotTimersRef.current = [];
  };

  const queueTutorialBotAction = (delayMs: number, action: () => void) => {
    const timerId = window.setTimeout(() => {
      tutorialBotTimersRef.current = tutorialBotTimersRef.current.filter(id => id !== timerId);
      if (!tutorialActiveRef.current) return;
      action();
    }, delayMs);
    tutorialBotTimersRef.current.push(timerId);
  };

  const markTutorialCompleted = () => {
    try {
      localStorage.setItem(ONLINE_TUTORIAL_DONE_KEY, '1');
    } catch {
      // ignore storage failures
    }
  };

  const clearTutorialMode = (markComplete = false) => {
    clearTutorialBotTimers();
    tutorialScriptRef.current = {
      botCaptureStarted: false,
      prepareFreezeShown: false,
      topRightRaceStarted: false,
      stealDefendQueued: false,
      completed: markComplete ? true : false,
    };
    tutorialActiveRef.current = false;
    setTutorialActive(false);
    setTutorialStep('NONE');
    if (markComplete) markTutorialCompleted();
  };

  const closeRulesModal = () => {
    setShowRules(false);
    try {
      localStorage.setItem(RULES_MODAL_SEEN_KEY, '1');
    } catch {
      // ignore storage failures
    }
  };

  const recordProbeResult = (success: boolean, rttMs?: number) => {
    pingWindowRef.current.push(success);
    if (pingWindowRef.current.length > 20) pingWindowRef.current.shift();
    const failed = pingWindowRef.current.filter(sample => !sample).length;
    const lossPct = pingWindowRef.current.length === 0 ? 0 : (failed / pingWindowRef.current.length) * 100;

    if (success && rttMs !== undefined) {
      const nextJitter = lastRttSampleRef.current === null
        ? 0
        : Math.round(((jitterRef.current ?? 0) * 0.7) + (Math.abs(rttMs - lastRttSampleRef.current) * 0.3));
      lastRttSampleRef.current = rttMs;
      jitterRef.current = nextJitter;
      setNetworkQuality(prev => ({ ...prev, rttMs, jitterMs: nextJitter, lossPct }));
      return;
    }

    setNetworkQuality(prev => ({ ...prev, lossPct }));
  };

  const handleProbePong = (pingId: string, sentAt: number) => {
    const pending = pendingPingRef.current;
    if (!pending || pending.pingId !== pingId) return;
    clearPendingPing();
    recordProbeResult(true, Date.now() - sentAt);
  };

  const sendProbePing = () => {
    if (!connRef.current?.open || roleRef.current === 'NONE' || roleRef.current === 'SOLO') return;
    if (pendingPingRef.current) return;

    const pingId = `ping-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sentAt = Date.now();
    const timeoutId = window.setTimeout(() => {
      if (!pendingPingRef.current || pendingPingRef.current.pingId !== pingId) return;
      pendingPingRef.current = null;
      recordProbeResult(false);
    }, 8000);

    pendingPingRef.current = { pingId, timeoutId };
    connRef.current.send({ type: 'PING', pingId, sentAt });
  };

  const setRoomIdLocal = (nextRoomId: string | null) => {
    roomIdRef.current = nextRoomId;
    setRoomId(nextRoomId);
  };

  const generateGuestSessionId = () =>
    `guest-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

  const sendStateSnapshot = (connection: any, state: GameState, phase: MatchPhase, revision: number) => {
    if (!connection?.open) return;
    connection.send({
      type: 'STATE_UPDATE',
      state,
      phase,
      revision,
      serverTime: Date.now(),
    });
  };

  const teardownRelayChannel = () => {
    const activeChannel = relayChannelRef.current;
    relayChannelRef.current = null;
    relayGuestIdRef.current = null;
    relayConnMapRef.current = {};
    if (!activeChannel || !supabase) return;
    try {
      supabase.removeChannel(activeChannel);
    } catch {
      // ignore teardown failures
    }
  };

  const sendRelayPacket = (to: string | null, message: unknown) => {
    const channel = relayChannelRef.current;
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: relayBroadcastEvent,
      payload: {
        from: relayClientIdRef.current,
        to,
        message,
      },
    });
  };

  const getRelayConnectionForGuest = (guestId: string) => {
    const existing = relayConnMapRef.current[guestId];
    if (existing) return existing;

    const connection = {
      open: true,
      send: (payload: unknown) => {
        relayGuestIdRef.current = guestId;
        sendRelayPacket(guestId, payload);
      },
      close: () => {
        if (relayGuestIdRef.current === guestId) relayGuestIdRef.current = null;
      },
    };

    relayConnMapRef.current[guestId] = connection;
    return connection;
  };

  const clearGuestResumeSession = () => {
    try {
      localStorage.removeItem(GUEST_RESUME_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  };

  const clearHostResumeSession = () => {
    try {
      localStorage.removeItem(HOST_RESUME_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  };

  const persistGuestResumeSession = (phaseOverride?: MatchPhase, revisionOverride?: number) => {
    if (roleRef.current !== 'GUEST' || !roomIdRef.current || !guestSessionIdRef.current) return;
    try {
      localStorage.setItem(GUEST_RESUME_STORAGE_KEY, JSON.stringify({
        roomId: roomIdRef.current,
        guestSessionId: guestSessionIdRef.current,
        lastRevision: revisionOverride ?? lastAppliedAuthorityRevisionRef.current,
        phase: phaseOverride ?? matchPhaseRef.current,
        savedAt: Date.now(),
      }));
    } catch {
      // ignore storage failures
    }
  };

  const persistHostResumeSession = (stateOverride?: GameState, phaseOverride?: MatchPhase, revisionOverride?: number) => {
    if (tutorialActiveRef.current) return;
    if (roleRef.current !== 'HOST' || !roomIdRef.current) return;
    try {
      localStorage.setItem(HOST_RESUME_STORAGE_KEY, JSON.stringify({
        roomId: roomIdRef.current,
        phase: phaseOverride ?? matchPhaseRef.current,
        revision: revisionOverride ?? authorityRevisionRef.current,
        guestSessionId: guestSessionIdRef.current,
        gameState: stateOverride ?? gameState,
        myBanPick: myBanPickRef.current,
        p2BanPick: p2BanPickRef.current,
        mySkillPicks: mySkillPicksRef.current,
        p2SkillPicks: p2SkillPicksRef.current,
        rpsState: {
          round: rpsRoundRef.current,
          scores: rpsScoresRef.current,
          myMove: rpsMyPickRef.current,
          p2Move: rpsP2PickRef.current,
        },
        savedAt: Date.now(),
      }));
    } catch {
      // ignore storage failures
    }
  };

  const sendPhaseMessage = (connection: any, phase: Extract<MatchPhase, 'BAN_PICK' | 'SKILL_PICK' | 'RPS'>, revision: number) => {
    if (!connection?.open) return;
    if (phase === 'BAN_PICK') {
      connection.send({ type: 'BAN_PHASE', revision });
      return;
    }
    connection.send(phase === 'SKILL_PICK'
      ? { type: 'SKILL_PICK_PHASE', revision }
      : { type: 'RPS_PHASE', revision });
  };

  const replayAuthoritativeStateTo = (connection: any) => {
    const revision = authorityRevisionRef.current;
    if (matchPhaseRef.current === 'PLAYING' || matchPhaseRef.current === 'RESULT') {
      sendStateSnapshot(connection, gameState, matchPhaseRef.current, revision);
      return;
    }
    if (matchPhaseRef.current === 'BAN_PICK' || matchPhaseRef.current === 'SKILL_PICK' || matchPhaseRef.current === 'RPS') {
      sendPhaseMessage(connection, matchPhaseRef.current, revision);
    }
  };

  const noteRemoteRevision = (revision: number) => {
    lastAppliedAuthorityRevisionRef.current = revision;
    authorityRevisionRef.current = Math.max(authorityRevisionRef.current, revision);
  };

  const shouldApplyAuthoritativeMessage = (revision: number) => revision > lastAppliedAuthorityRevisionRef.current;

  const rememberGuestActionId = (actionId: string) => {
    guestActionIdsRef.current.add(actionId);
    guestActionHistoryRef.current.push(actionId);
    if (guestActionHistoryRef.current.length > 256) {
      const dropped = guestActionHistoryRef.current.shift();
      if (dropped) guestActionIdsRef.current.delete(dropped);
    }
  };

  const resetOnlineProtocolState = () => {
    clearReconnectTimer();
    clearHostReconnectTimer();
    clearPendingPing();
    teardownRelayChannel();
    transportRef.current = 'NONE';
    connRef.current = null;
    guestSessionIdRef.current = null;
    authorityRevisionRef.current = 0;
    lastAppliedAuthorityRevisionRef.current = 0;
    guestActionSeqRef.current = 0;
    lastGuestActionSeqRef.current = 0;
    guestActionHistoryRef.current = [];
    guestActionIdsRef.current.clear();
    pingWindowRef.current = [];
    lastRttSampleRef.current = null;
    jitterRef.current = null;
    reconnectAttemptRef.current = 0;
    hostReconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setNetworkQuality({ rttMs: null, jitterMs: null, lossPct: 0, phase: 'WAITING', revision: 0 });
    setMatchPhaseLocal('WAITING');
    setMyBanPick(null);
    myBanPickRef.current = null;
    p2BanPickRef.current = null;
  };

  const sendAuthoritativePhase = (phase: Extract<MatchPhase, 'BAN_PICK' | 'SKILL_PICK' | 'RPS'>) => {
    const revision = nextAuthorityRevision();
    setMatchPhaseAndUi(phase);
    if (connRef.current) {
      sendPhaseMessage(connRef.current, phase, revision);
    }
    persistHostResumeSession(undefined, phase, revision);
  };

  // --- Invite link: detect ?join=XXXX on cold start ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code && /^\d{4}$/.test(code)) {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete('join');
      window.history.replaceState({}, '', cleaned.toString());
      pendingInviteCodeRef.current = code;
    }
  }, []);

  // --- Persistence ---
  useEffect(() => {
    try {
      let loadedSettings = DEFAULT_SETTINGS;
      const savedSettings = localStorage.getItem('gridrush_settings');
      if (savedSettings) {
        try { loadedSettings = sanitizeSettings(JSON.parse(savedSettings), DEFAULT_SETTINGS); } catch { /* bad JSON */ }
      }
      setSettings(loadedSettings);

      const savedStats = localStorage.getItem('gridrush_stats');
      if (savedStats) {
        try { setStats(sanitizeStats(JSON.parse(savedStats), DEFAULT_STATS)); } catch { /* bad JSON */ }
      }

      if (loadedSettings.guidesEnabled && localStorage.getItem(RULES_MODAL_SEEN_KEY) !== '1') {
        setShowRules(true);
        localStorage.setItem(RULES_MODAL_SEEN_KEY, '1');
      }
    } catch (e) { console.error('Load failed', e); }
    setLocalPersistenceReady(true);
    if (pendingInviteCodeRef.current) {
      const code = pendingInviteCodeRef.current;
      pendingInviteCodeRef.current = null;
      setAppMode('LOBBY');
      joinGame(code);
    }
  }, []);

  useEffect(() => {
    // Product decision: cold start should always return to menu instead of auto-restoring sessions.
    clearHostResumeSession();
    clearGuestResumeSession();
  }, []);

  useEffect(() => () => {
    clearReconnectTimer();
    clearHostReconnectTimer();
    clearPendingPing();
    teardownRelayChannel();
    if (cloudSyncTimerRef.current !== null) {
      window.clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (roleRef.current === 'NONE' || roleRef.current === 'SOLO' || !roomId) return;

    const pingInterval = window.setInterval(() => {
      sendProbePing();
    }, 4000);

    return () => window.clearInterval(pingInterval);
  }, [roomId]);

  // --- Audio & Theme Effects ---
  useEffect(() => {
    audio.setSettings(settings.soundEnabled, settings.musicEnabled);
    if (settings.musicEnabled && appMode !== 'MENU') {
        audio.startMusic();
    } else {
        audio.stopMusic();
    }
  }, [settings, appMode]);

  useEffect(() => {
      // Initialize Audio Context on first interaction
      const initAudio = () => audio.init();
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
  }, []);

  useEffect(() => {
      // Apply theme
      const root = document.documentElement;
      if (settings.theme === 'dark') {
          root.classList.add('dark');
      } else {
          root.classList.remove('dark');
      }
  }, [settings.theme]);

  const resolveAchievements = (currentStats: UserStats) => {
    const unlocked = [...currentStats.unlockedAchievements];
    let changed = false;
    const newlyUnlocked: string[] = [];

    ACHIEVEMENTS_LIST.forEach(ach => {
      if (!unlocked.includes(ach.id) && ach.condition(currentStats)) {
        unlocked.push(ach.id);
        newlyUnlocked.push(ach.titleEn);
        changed = true;
      }
    });

    return {
      stats: changed ? { ...currentStats, unlockedAchievements: unlocked } : currentStats,
      newlyUnlocked,
    };
  };

  const finalizeStats = (rawStats: UserStats) => {
    const resolved = resolveAchievements(rawStats);
    try {
      localStorage.setItem('gridrush_stats', JSON.stringify(resolved.stats));
    } catch {
      // ignore storage failures
    }
    if (resolved.newlyUnlocked.length > 0) {
      setNewAchievement(resolved.newlyUnlocked[resolved.newlyUnlocked.length - 1]);
      audio.playWin();
      window.setTimeout(() => setNewAchievement(null), 4000);
    }
    return resolved.stats;
  };

  const saveStats = (next: UserStats | ((prev: UserStats) => UserStats)) => {
    setStats(prev => {
      const newStats = typeof next === 'function'
        ? (next as (p: UserStats) => UserStats)(prev)
        : next;
      return finalizeStats(newStats);
    });
  };

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('gridrush_settings', JSON.stringify(newSettings));
  };

  const clearData = () => {
    localStorage.removeItem('gridrush_stats');
    localStorage.removeItem('gridrush_settings');
    localStorage.removeItem(RULES_MODAL_SEEN_KEY);
    localStorage.removeItem(ONLINE_TUTORIAL_DONE_KEY);
    localStorage.removeItem('gridrush_online_guide_seen_v2');
    clearGuestResumeSession();
    clearHostResumeSession();
    setStats(DEFAULT_STATS);
    setSettings(DEFAULT_SETTINGS);
    window.location.reload();
  };

  const handlePracticeRecord = (record: PracticeRecord) => {
      saveStats(prev => ({ ...prev, practiceRecords: [...prev.practiceRecords, record] }));
  };

  const formatLocaleDateTime = (value: string | number | Date) =>
    new Date(value).toLocaleString(settings.language === 'zh' ? 'zh-CN' : 'en-US');

  const clearAuthFeedback = () => {
    setAuthError(null);
    setAuthNotice(null);
  };

  const hydrateCloudAccount = async (user: User) => {
    const supabaseClient = supabase;
    if (!supabaseClient) {
      setAuthLoading(false);
      setCloudSyncStatus('LOCAL_ONLY');
      return;
    }

    setAuthLoading(true);
    setCloudSyncStatus('SYNCING');
    setAuthError(null);

    try {
      const fallbackNickname = getDefaultNickname(
        typeof user.user_metadata?.nickname === 'string' ? user.user_metadata.nickname : user.email,
      );

      const { data: profileRow, error: profileFetchError } = await supabaseClient
        .from('profiles')
        .select('id, email, nickname, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle();
      if (profileFetchError) throw profileFetchError;

      const profilePayload = {
        id: user.id,
        email: user.email ?? profileRow?.email ?? null,
        nickname: (profileRow?.nickname?.trim() || fallbackNickname).slice(0, 24),
      };

      const nextProfile: ProfileRow = {
        ...profilePayload,
        created_at: profileRow?.created_at ?? null,
        updated_at: profileRow?.updated_at ?? null,
      };

      const { error: profileUpsertError } = await supabaseClient.from('profiles').upsert(profilePayload);
      if (profileUpsertError) throw profileUpsertError;

      const { data: statsRow, error: statsFetchError } = await supabaseClient
        .from('user_stats')
        .select('user_id, stats_json, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (statsFetchError) throw statsFetchError;

      const mergedStats = mergeUserStats(statsRef.current, statsRow?.stats_json ?? DEFAULT_STATS, DEFAULT_STATS);
      const finalizedStats = finalizeStats(mergedStats);

      cloudHydratedRef.current = false;
      setProfile(nextProfile);
      setStats(finalizedStats);

      const { error: statsUpsertError } = await supabaseClient.from('user_stats').upsert({
        user_id: user.id,
        stats_json: finalizedStats,
      });
      if (statsUpsertError) throw statsUpsertError;

      cloudHydratedRef.current = true;
      setCloudSyncStatus('SYNCED');
      setLastCloudSyncAt(formatLocaleDateTime(Date.now()));
    } catch (err) {
      cloudHydratedRef.current = false;
      setCloudSyncStatus('ERROR');
      setAuthError(err instanceof Error ? err.message : 'Supabase request failed');
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  };

  const pushStatsToCloud = async (statsToUpload: UserStats, exposeError = false) => {
    if (!supabase || !authSession?.user) {
      setCloudSyncStatus('LOCAL_ONLY');
      return;
    }

    setCloudSyncStatus('SYNCING');
    try {
      const { error: statsUpsertError } = await supabase.from('user_stats').upsert({
        user_id: authSession.user.id,
        stats_json: statsToUpload,
      });
      if (statsUpsertError) throw statsUpsertError;
      setCloudSyncStatus('SYNCED');
      setLastCloudSyncAt(formatLocaleDateTime(Date.now()));
      if (exposeError) setAuthNotice(t.account_synced);
    } catch (err) {
      setCloudSyncStatus('ERROR');
      if (exposeError) {
        setAuthError(err instanceof Error ? err.message : 'Supabase request failed');
      }
      console.error(err);
    }
  };

  useEffect(() => {
    if (!localPersistenceReady) return;
    const supabaseClient = supabase;
    if (!supabaseClient) {
      setAuthLoading(false);
      setCloudSyncStatus('LOCAL_ONLY');
      return;
    }

    let disposed = false;

    const initializeSession = async () => {
      setAuthLoading(true);
      const { data } = await supabaseClient.auth.getSession();
      if (disposed) return;
      setAuthSession(data.session);
      if (data.session?.user) {
        await hydrateCloudAccount(data.session.user);
        return;
      }
      setProfile(null);
      setCloudSyncStatus('LOCAL_ONLY');
      setLastCloudSyncAt(null);
      setAuthLoading(false);
    };

    void initializeSession();

    const { data: authSubscription } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (disposed) return;
      setAuthSession(nextSession);
      if (!nextSession?.user) {
        cloudHydratedRef.current = false;
        setProfile(null);
        setCloudSyncStatus('LOCAL_ONLY');
        setLastCloudSyncAt(null);
        setAuthLoading(false);
        return;
      }
      void hydrateCloudAccount(nextSession.user);
    });

    return () => {
      disposed = true;
      authSubscription.subscription.unsubscribe();
    };
  }, [localPersistenceReady]);

  useEffect(() => {
    if (!supabase || !authSession?.user || !cloudHydratedRef.current) return;

    if (cloudSyncTimerRef.current !== null) {
      window.clearTimeout(cloudSyncTimerRef.current);
    }

    cloudSyncTimerRef.current = window.setTimeout(() => {
      void pushStatsToCloud(statsRef.current);
    }, 900);

    return () => {
      if (cloudSyncTimerRef.current !== null) {
        window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = null;
      }
    };
  }, [stats, authSession?.user?.id]);

  const handleSignIn = async ({ email, password }: { email: string; password: string }) => {
    clearAuthFeedback();
    if (!supabase) {
      setAuthError(t.account_env_missing_desc);
      return;
    }

    setAuthBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignUp = async ({ email, password, nickname }: { email: string; password: string; nickname: string }) => {
    clearAuthFeedback();
    const normalizedNickname = normalizeNickname(nickname);
    if (!isValidNickname(normalizedNickname)) {
      setAuthError(t.account_nickname_too_short);
      return;
    }
    if (!supabase) {
      setAuthError(t.account_env_missing_desc);
      return;
    }

    setAuthBusy(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { nickname: normalizedNickname },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setAuthNotice(t.account_verify_email);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to create account');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    clearAuthFeedback();
    if (!supabase) {
      setAuthError(t.account_env_missing_desc);
      return;
    }

    setAuthBusy(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setAuthNotice(t.account_signed_out);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign out');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveNickname = async (nickname: string) => {
    clearAuthFeedback();
    const normalizedNickname = normalizeNickname(nickname);
    if (!isValidNickname(normalizedNickname)) {
      setAuthError(t.account_nickname_too_short);
      return;
    }
    if (!supabase || !authSession?.user) {
      setAuthError(t.account_env_missing_desc);
      return;
    }

    setAuthBusy(true);
    try {
      const nextProfile: ProfileRow = {
        id: authSession.user.id,
        email: authSession.user.email ?? null,
        nickname: normalizedNickname,
      };
      const { error: profileUpsertError } = await supabase.from('profiles').upsert(nextProfile);
      if (profileUpsertError) throw profileUpsertError;
      setProfile(prev => ({ ...prev, ...nextProfile }));
      setAuthNotice(t.account_synced);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setAuthBusy(false);
    }
  };

  const accountLabel = authSession?.user
    ? (profile?.nickname?.trim() || getDefaultNickname(authSession.user.email))
    : t.account_sign_in;

  // --- Heartbeat System ---
  useEffect(() => {
     if (gameState.status !== 'PLAYING' || !myId) return;
     
     const hbInterval = setInterval(() => {
         if (connRef.current && connRef.current.open) {
             connRef.current.send({ type: 'HEARTBEAT', id: myId, timestamp: Date.now() });
         }
         // Self update for Host
         if (roleRef.current === 'HOST') {
             suppressNextSyncRef.current = true;
             setGameState(prev => ({
                 ...prev,
                 p1: { ...prev.p1, lastHeartbeat: Date.now() }
             }));
         }
     }, 2000);
     
     return () => clearInterval(hbInterval);
  }, [gameState.status, myId]);


  // --- Game Loop (Host Logic + Guest Detection + UI Ticks) ---
  useEffect(() => {
    // FIXED: Ensure loop runs for GUESTS too, so setTick triggers re-renders for the timer
    if (gameState.status !== 'PLAYING') return;

    const interval = setInterval(() => {
      const now = Date.now();
      // Always tick to force re-render for UI timers
      setTick(t => t + 1);

      // Solo Challenge Timer (Only for Solo Player)
      if (roleRef.current === 'SOLO') {
        const diff = now - challengeStartTime;
        const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setChallengeTime(`${mins}:${secs}`);
      }
      
      // --- HOST LOGIC: ANOMALY DETECTION ---
      if (roleRef.current === 'HOST') {
          let stateChanged = false;
          const nextState = { ...gameState };

          if (guestSessionIdRef.current && now - nextState.p2.lastHeartbeat > 10000) {
            setConnectionStatus('RECONNECTING');
          } else if (guestSessionIdRef.current) {
            setConnectionStatus('CONNECTED');
          }

          const checkPlayerAnomaly = (pid: PlayerId) => {
              const pKey = pid === 'P1' ? 'p1' : 'p2';
              const player = nextState[pKey];
              
              if (player.activeCell !== null) {
                  // 1. HARD LIMIT CHECK (180s)
                  if (now - player.challengeStartTime > 180000) {
                      // Force Exit Cell
                      const cellId = player.activeCell;
                      nextState.cells[cellId].activePlayers = nextState.cells[cellId].activePlayers.filter(id => id !== pid);
                      nextState[pKey] = { ...player, activeCell: null, isDefending: false };
                      stateChanged = true;
                  }
                  // 2. AFK CHECK (Input idle > 35s)
                  else if (now - player.lastInputTime > 35000) {
                      const cellId = player.activeCell;
                      nextState.cells[cellId].activePlayers = nextState.cells[cellId].activePlayers.filter(id => id !== pid);
                      nextState[pKey] = { ...player, activeCell: null, isDefending: false };
                      stateChanged = true;
                  }
                  // 3. DISCONNECT CHECK (Heartbeat > 10s)
                  else if (now - player.lastHeartbeat > 10000) {
                      const cellId = player.activeCell;
                      nextState.cells[cellId].activePlayers = nextState.cells[cellId].activePlayers.filter(id => id !== pid);
                      nextState[pKey] = { ...player, activeCell: null, isDefending: false };
                      stateChanged = true;
                  }
              }
          };

          checkPlayerAnomaly('P1');
          checkPlayerAnomaly('P2');

          // Check Steal Expiry (Host manages game rules)
          if (nextState.stealNotification) {
            if (now > nextState.stealNotification.expiresAt) {
              nextState.stealNotification = null;
              stateChanged = true;
            }
          }

          // Clear expired freezes
          if (nextState.p1.frozenUntil > 0 && now > nextState.p1.frozenUntil) {
            nextState.p1 = { ...nextState.p1, frozenUntil: 0 }; stateChanged = true;
          }
          if (nextState.p2.frozenUntil > 0 && now > nextState.p2.frozenUntil) {
            nextState.p2 = { ...nextState.p2, frozenUntil: 0 }; stateChanged = true;
          }

          // Duel PICKING timeout: cancel duel if initiator hasn't picked within deadline
          if (nextState.duelState?.phase === 'PICKING' && now > nextState.duelState.pickDeadline) {
            nextState.duelState = null; stateChanged = true;
          }

          // Clear expired fun card effects
          if (gameModeRef.current === 'FUN' && nextState.funCardEffects) {
            const fe = nextState.funCardEffects;
            if (
              (fe.blindP1Until > 0 && now > fe.blindP1Until) ||
              (fe.blindP2Until > 0 && now > fe.blindP2Until) ||
              (fe.hardModeP1Until > 0 && now > fe.hardModeP1Until) ||
              (fe.hardModeP2Until > 0 && now > fe.hardModeP2Until) ||
              (fe.flipP1Until > 0 && now > fe.flipP1Until) ||
              (fe.flipP2Until > 0 && now > fe.flipP2Until)
            ) {
              nextState.funCardEffects = {
                blindP1Until:    fe.blindP1Until    > 0 && now > fe.blindP1Until    ? 0 : fe.blindP1Until,
                blindP2Until:    fe.blindP2Until    > 0 && now > fe.blindP2Until    ? 0 : fe.blindP2Until,
                hardModeP1Until: fe.hardModeP1Until > 0 && now > fe.hardModeP1Until ? 0 : fe.hardModeP1Until,
                hardModeP2Until: fe.hardModeP2Until > 0 && now > fe.hardModeP2Until ? 0 : fe.hardModeP2Until,
                flipP1Until:     fe.flipP1Until     > 0 && now > fe.flipP1Until     ? 0 : fe.flipP1Until,
                flipP2Until:     fe.flipP2Until     > 0 && now > fe.flipP2Until     ? 0 : fe.flipP2Until,
              };
              stateChanged = true;
            }
          }

          if (stateChanged) {
              setGameState(nextState);
          }
      } 
      // --- GUEST LOGIC: DETECT HOST DISCONNECT ---
      else if (roleRef.current === 'GUEST') {
          // If no packet from Host for > 10s, consider disconnected
          if (now - lastPacketTime.current > 10000) {
            scheduleGuestReconnect();
          }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.status, gameState.stealNotification, gameState.duelState, challengeStartTime, gameState]);

  const syncState = (newState?: GameState, phaseOverride?: MatchPhase) => {
    if (roleRef.current === 'HOST' && connRef.current) {
      const stateToSend = newState || gameState;
      const phase = phaseOverride ?? (stateToSend.winner ? 'RESULT' : matchPhaseRef.current);
      sendStateSnapshot(connRef.current, stateToSend, phase, nextAuthorityRevision());
    }
  };

  useEffect(() => {
    if (suppressNextSyncRef.current) { suppressNextSyncRef.current = false; return; }
    if (roleRef.current === 'HOST' && gameState.status !== 'IDLE') {
      if (connRef.current && connRef.current.open) {
        syncState(gameState, gameState.winner ? 'RESULT' : matchPhaseRef.current);
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (roleRef.current !== 'HOST' || !roomIdRef.current) return;
    persistHostResumeSession();
  }, [gameState, appMode, mySkillPicks, rpsState]);

  useEffect(() => {
    if (gameState.winner && roleRef.current !== 'SOLO' && matchPhaseRef.current !== 'RESULT') {
      setMatchPhaseAndUi('RESULT');
    }
  }, [gameState.winner]);

  useEffect(() => {
    if (!tutorialActive) return;

    const interval = window.setInterval(() => {
      setGameState(prev => ({
        ...prev,
        p2: {
          ...prev.p2,
          lastHeartbeat: Date.now(),
          lastInputTime: prev.p2.activeCell !== null ? Date.now() : prev.p2.lastInputTime,
        },
      }));
    }, 2500);

    return () => window.clearInterval(interval);
  }, [tutorialActive]);

  useEffect(() => {
    if (!tutorialActive) return;

    if (gameState.winner === 'P1') {
      if (!tutorialScriptRef.current.completed) {
        tutorialScriptRef.current.completed = true;
        setTutorialStep('VICTORY');
        markTutorialCompleted();
      }
      return;
    }

    if (tutorialStep === 'CLICK_CENTER' && gameState.p1.activeCell === 4) {
      setTutorialStep('CENTER_MINIGAME');
      return;
    }

    if (tutorialStep === 'CENTER_MINIGAME' && gameState.cells[4]?.owner === 'P1') {
      setTutorialStep('WATCH_BOT_CAPTURE');
      return;
    }

    if (tutorialStep === 'BOT_CAPTURING' && gameState.cells[0]?.owner === 'P2' && !tutorialScriptRef.current.prepareFreezeShown) {
      tutorialScriptRef.current.prepareFreezeShown = true;
      setTutorialStep('PREPARE_FREEZE');
      return;
    }

    if (tutorialStep === 'USE_FREEZE' && gameState.p1.freezesRemaining === 0) {
      setTutorialStep('RACE_TOP_RIGHT');
      return;
    }

    if (tutorialStep === 'RACE_TOP_RIGHT' && gameState.cells[2]?.owner === 'P1') {
      setTutorialStep('STEAL_TOP_LEFT');
      return;
    }

    if (
      tutorialStep === 'STEAL_TOP_LEFT' &&
      gameState.p1.activeCell === 0 &&
      gameState.stealNotification?.challengerId === 'P1' &&
      !tutorialScriptRef.current.stealDefendQueued
    ) {
      tutorialScriptRef.current.stealDefendQueued = true;
      setTutorialStep('STEAL_CONTEST');
      queueTutorialBotAction(900, () => processDefend('P2'));
      return;
    }

    if (tutorialStep === 'STEAL_CONTEST' && gameState.cells[0]?.owner === 'P1') {
      setTutorialStep('CLAIM_FINAL_CELL');
      return;
    }

    if (tutorialStep === 'CLAIM_FINAL_CELL' && gameState.p1.activeCell === 8) {
      setTutorialStep('FINAL_MINIGAME');
    }
  }, [tutorialActive, tutorialStep, gameState]);

  useEffect(() => {
    if (!gameState.winner || !myId || roleRef.current === 'SOLO') return;
    if (tutorialActiveRef.current) return;

    const myResult: 'WIN' | 'LOSE' | 'DRAW' = gameState.winner === 'DRAW'
      ? 'DRAW'
      : gameState.winner === myId
        ? 'WIN'
        : 'LOSE';
    const mode = gameModeRef.current;
    const isStandard = mode === 'STANDARD';

    saveStats(prevStats => ({
      ...prevStats,
      onlineWins: prevStats.onlineWins + (myResult === 'WIN' ? 1 : 0),
      onlineLosses: (prevStats.onlineLosses ?? 0) + (myResult === 'LOSE' ? 1 : 0),
      onlineDraws: (prevStats.onlineDraws ?? 0) + (myResult === 'DRAW' ? 1 : 0),
      modeStandardWins: (prevStats.modeStandardWins ?? 0) + (isStandard && myResult === 'WIN' ? 1 : 0),
      modeStandardLosses: (prevStats.modeStandardLosses ?? 0) + (isStandard && myResult === 'LOSE' ? 1 : 0),
      modeStandardDraws: (prevStats.modeStandardDraws ?? 0) + (isStandard && myResult === 'DRAW' ? 1 : 0),
      modeFunWins: (prevStats.modeFunWins ?? 0) + (!isStandard && myResult === 'WIN' ? 1 : 0),
      modeFunLosses: (prevStats.modeFunLosses ?? 0) + (!isStandard && myResult === 'LOSE' ? 1 : 0),
      modeFunDraws: (prevStats.modeFunDraws ?? 0) + (!isStandard && myResult === 'DRAW' ? 1 : 0),
      recentOnlineResults: [
        ...(prevStats.recentOnlineResults ?? []),
        { at: Date.now(), result: myResult, mode: gameModeRef.current },
      ].slice(-50),
    }));
  }, [gameState.winner, myId]);

  useEffect(() => {
    if (!gameState.winner) {
      setRematchInviteFrom(null);
      setRematchStatus('NONE');
    }
  }, [gameState.winner]);

  // --- Game Logic ---

  const startNewGame = (
    mode: 'ONLINE' | 'SOLO',
    skillOverrides?: { p1: string[]; p2: string[] },
    soloDifficulty?: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT',
    headstartLoser?: 'P1' | 'P2' | null,
    options?: { customGameIds?: string[]; customNames?: { p1?: string; p2?: string } }
  ) => {
    audio.playClick();
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
    let gameIds: string[];
    let numCells = 9;

    if (mode === 'SOLO') {
       gameIds = options?.customGameIds?.length ? [...options.customGameIds] : shuffleGames(ALL_MINI_GAME_IDS);
       numCells = gameIds.length;
    } else {
       gameIds = options?.customGameIds?.length ? [...options.customGameIds].slice(0, 9) : getOnlineBoardGameIds();
    }

    const cells: CellData[] = Array(numCells).fill(null).map((_, i) => ({
      id: i,
      gameId: gameIds[i],
      owner: null,
      activePlayers: [],
      lastInteraction: 0,
    }));

    const makePlayer = (id: PlayerId, name: string, picks?: string[]): PlayerState => ({
      ...INITIAL_PLAYER_STATE(id, name),
      stealsRemaining: picks ? (picks.includes('STEAL')  ? 1 : 0) : 1,
      freezesRemaining: picks ? (picks.includes('FREEZE') ? 1 : 0) : 1,
      duelsRemaining:   picks ? (picks.includes('DUEL')   ? 1 : 0) : 1,
    });

    let newGame: GameState = {
      status: 'PLAYING',
      cells,
      p1: makePlayer('P1', options?.customNames?.p1 ?? 'Player Blue', skillOverrides?.p1),
      p2: makePlayer('P2', options?.customNames?.p2 ?? 'Player Red',  skillOverrides?.p2),
      winner: null,
      stealNotification: null,
      duelState: null,
      funCardEffects: { blindP1Until: 0, blindP2Until: 0, hardModeP1Until: 0, hardModeP2Until: 0, flipP1Until: 0, flipP2Until: 0 },
    };

    // Apply 2-second input freeze to the RPS loser
    if (headstartLoser === 'P1') {
      newGame = { ...newGame, p1: { ...newGame.p1, frozenUntil: Date.now() + 2000 } };
    } else if (headstartLoser === 'P2') {
      newGame = { ...newGame, p2: { ...newGame.p2, frozenUntil: Date.now() + 2000 } };
    }
    
    if (mode === 'ONLINE') {
       setMatchPhaseAndUi('PLAYING');
       guestActionSeqRef.current = 0;
       lastGuestActionSeqRef.current = 0;
       guestActionHistoryRef.current = [];
       guestActionIdsRef.current.clear();
       setGameState(newGame);
       setConnectionStatus('CONNECTED');
       lastPacketTime.current = Date.now(); // Reset timestamp
      if (!tutorialActiveRef.current) {
        saveStats(prev => ({ ...prev, gamesPlayed: prev.gamesPlayed + 1 }));
      }
    } else {
       // Setup Solo State
       // In Solo, activeCell acts as the "Current Level Index"
       const soloGame = { ...newGame, p1: { ...newGame.p1, activeCell: 0 } };
       setGameState(soloGame);
       
       soloDifficultyRef.current = soloDifficulty ?? 'NORMAL';
       roleRef.current = 'SOLO';
       setMyId('P1');
       setChallengeStartTime(Date.now());
       // Reset offset for solo
       timeOffsetRef.current = 0;
       setAppMode('GAME');
      saveStats(prev => ({ ...prev, gamesPlayed: prev.gamesPlayed + 1 }));
    }
  };

  const startOnlineTutorialMatch = () => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    clearGuestResumeSession();
    clearHostResumeSession();
    if (peerRef.current) peerRef.current.destroy();
    teardownRelayChannel();
    resetOnlineProtocolState();

    clearTutorialBotTimers();
    tutorialScriptRef.current = {
      botCaptureStarted: false,
      prepareFreezeShown: false,
      topRightRaceStarted: false,
      stealDefendQueued: false,
      completed: false,
    };

    tutorialActiveRef.current = true;
    setTutorialActive(true);
    setTutorialStep('CLICK_CENTER');

    transportRef.current = 'NONE';
    connRef.current = null;
    roleRef.current = 'HOST';
    gameModeRef.current = 'STANDARD';
    manualDisconnectRef.current = false;
    setMyId('P1');
    setRoomIdLocal('TUTOR');
    setIsConnecting(false);
    setConnectionStatus('CONNECTED');
    setError(null);
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
    setMyBanPick(null);
    myBanPickRef.current = null;
    p2BanPickRef.current = null;
    setMySkillPicks(['STEAL', 'FREEZE']);
    mySkillPicksRef.current = ['STEAL', 'FREEZE'];
    p2SkillPicksRef.current = ['STEAL'];

    startNewGame(
      'ONLINE',
      { p1: ['STEAL', 'FREEZE'], p2: ['STEAL'] },
      undefined,
      'P2',
      {
        customGameIds: ['math', 'stroop', 'reaction', 'sequence', 'mash', 'memory', 'lockpick', 'password', 'burst'],
        customNames: {
          p1: t.online_tutorial_player_name,
          p2: t.online_tutorial_bot_name,
        },
      }
    );
  };

  const processCellClick = (pid: PlayerId, cellIndex: number) => {
    setGameState(prev => {
      // Solo mode click logic is handled by completion mainly, but this protects against invalid clicks
      if (roleRef.current === 'SOLO') return prev; 
      
      const cell = prev.cells[cellIndex];
      const player = pid === 'P1' ? prev.p1 : prev.p2;
      const opponent = pid === 'P1' ? prev.p2 : prev.p1;
      const now = Date.now();

      if (prev.winner) return prev;
      if (player.activeCell === cellIndex) return prev; 
      if (cell.owner === pid) return prev;

      // 1. Check Cell Cooldown (3 Failures Rule)
      if (player.cellCooldowns[cellIndex] && now < player.cellCooldowns[cellIndex]) {
          return prev; // Block entry
      }

      // 2. Check Steal Cooldown (Abandoned steal rule)
      if (cell.owner && cell.owner !== pid) {
          if (now < player.stealCooldown) return prev; // Block entry if steal cooldown active
      }

      // Logic for entering a cell
      if (cell.owner && cell.owner !== pid) {
        if (player.stealsRemaining <= 0) return prev;
        
        if (roleRef.current === 'HOST') {
          const isMe = pid === 'P1';
          if (isMe) saveStats(prev => ({ ...prev, totalSteals: prev.totalSteals + 1 }));
        }

        const pStateKey = pid === 'P1' ? 'p1' : 'p2';
        return {
          ...prev,
          [pStateKey]: { 
              ...prev[pStateKey], 
              activeCell: cellIndex, 
              stealsRemaining: 0, 
              challengeStartTime: now,
              lastInputTime: now // Reset AFK timer on entry
          },
          cells: prev.cells.map((c, i) => i === cellIndex ? { ...c, activePlayers: [...c.activePlayers, pid] } : c),
          stealNotification: {
            challengerId: pid,
            defenderId: opponent.id,
            cellId: cellIndex,
            timestamp: now,
            expiresAt: now + 5000
          }
        };
      }

      const pKey = pid === 'P1' ? 'p1' : 'p2';
      const oldCellIdx = prev[pKey].activeCell;
      const newCells = prev.cells.map((c, i) => {
        let actives = [...c.activePlayers];
        if (i === oldCellIdx) actives = actives.filter(id => id !== pid);
        if (i === cellIndex) actives.push(pid);
        return { ...c, activePlayers: actives };
      });

      return {
        ...prev,
        cells: newCells,
        [pKey]: { 
            ...prev[pKey], 
            activeCell: cellIndex, 
            challengeStartTime: now,
            lastInputTime: now 
        }
      };
    });
  };

  // Logic to handle voluntarily abandoning a cell
  const processAbandon = (pid: PlayerId) => {
     if (roleRef.current === 'SOLO') return; // Cannot abandon in solo
     
     setGameState(prev => {
        const pKey = pid === 'P1' ? 'p1' : 'p2';
        const currentCellIdx = prev[pKey].activeCell;
        
        if (currentCellIdx === null) return prev;

        // Clean up active players list
        const newCells = prev.cells.map((c, i) => {
            if (i === currentCellIdx) {
                return { ...c, activePlayers: c.activePlayers.filter(id => id !== pid) };
            }
            return c;
        });

        // If this was a steal attempt, clear the notification AND apply steal cooldown
        let stealNote = prev.stealNotification;
        let newStealCooldown = prev[pKey].stealCooldown;
        
        if (prev.stealNotification?.challengerId === pid) {
            stealNote = null;
            newStealCooldown = Date.now() + 20000; // 20s Cooldown on steal cancel
        }

        return {
            ...prev,
            cells: newCells,
            [pKey]: { 
                ...prev[pKey], 
                activeCell: null, 
                isDefending: false, 
                challengeStartTime: 0,
                stealCooldown: newStealCooldown 
            },
            stealNotification: stealNote
        };
     });
  };

  const processDefend = (pid: PlayerId) => {
    if (roleRef.current === 'SOLO') return;
    setGameState(prev => {
      if (!prev.stealNotification || prev.stealNotification.defenderId !== pid) return prev;
      
      if (roleRef.current === 'HOST' && pid === 'P1') {
         saveStats(prev => ({ ...prev, totalDefends: prev.totalDefends + 1 }));
      }

      const targetCell = prev.stealNotification.cellId;
      const pKey = pid === 'P1' ? 'p1' : 'p2';
      const oldCellIdx = prev[pKey].activeCell;
      const newCells = prev.cells.map((c, i) => {
        let actives = [...c.activePlayers];
        if (i === oldCellIdx) actives = actives.filter(id => id !== pid);
        if (i === targetCell) actives.push(pid);
        return { ...c, activePlayers: actives };
      });

      return {
        ...prev,
        cells: newCells,
        [pKey]: { 
            ...prev[pKey], 
            activeCell: targetCell, 
            isDefending: true, 
            challengeStartTime: Date.now(),
            lastInputTime: Date.now()
        },
        stealNotification: null
      };
    });
  };

  const processInteraction = (pid: PlayerId) => {
     setGameState(prev => {
         const pKey = pid === 'P1' ? 'p1' : 'p2';
         return {
             ...prev,
             [pKey]: { ...prev[pKey], lastInputTime: Date.now() }
         };
     });
  };

  const processGameComplete = (pid: PlayerId, success: boolean) => {
    setGameState(prev => {
      const pKey = pid === 'P1' ? 'p1' : 'p2';
      const cellIdx = prev[pKey].activeCell;
      
      // Solo Mode Logic
      if (roleRef.current === 'SOLO') {
        // ... (Solo Logic unchanged mostly, just needs to handle success=false if needed, though solo usually just waits)
        if (!success) return prev; // Solo usually loops until win
        
        const currentLevel = prev.p1.activeCell;
        if (currentLevel === null) return prev;
        
        const nextLevel = currentLevel + 1;
        const finished = nextLevel >= prev.cells.length;

        if (finished) {
           const timeTaken = Date.now() - challengeStartTime;
           const diff = soloDifficultyRef.current;
           saveStats(prevStats => {
             const newFastest = (prevStats.fastestSoloRun === 0 || timeTaken < prevStats.fastestSoloRun) ? timeTaken : prevStats.fastestSoloRun;
             const prevDiffBest = prevStats.soloRunsByDiff?.[diff] ?? 0;
             const newDiffBest = prevDiffBest === 0 || timeTaken < prevDiffBest ? timeTaken : prevDiffBest;
             return {
               ...prevStats,
               fastestSoloRun: newFastest,
               soloRunsByDiff: { ...prevStats.soloRunsByDiff, [diff]: newDiffBest },
             };
           });
           audio.playWin();
           
           return {
             ...prev,
             status: 'FINISHED',
             winner: 'P1',
             p1: { ...prev.p1, activeCell: null }
           };
        } else {
           return {
             ...prev,
             p1: { ...prev.p1, activeCell: nextLevel }
           };
        }
      }

      // Online Mode Logic
      if (cellIdx === null) return prev;

      // FAILURE HANDLING
      if (!success) {
          const newFailures = (prev[pKey].cellFailures[cellIdx] || 0) + 1;
          const newCooldowns = { ...prev[pKey].cellCooldowns };
          
          let updatedPlayer = { 
              ...prev[pKey], 
              cellFailures: { ...prev[pKey].cellFailures, [cellIdx]: newFailures } 
          };

          // 3 Failures -> 10s Cooldown
          if (newFailures >= 3) {
              newCooldowns[cellIdx] = Date.now() + 10000;
              updatedPlayer.cellCooldowns = newCooldowns;
              updatedPlayer.activeCell = null; // Kick out
              updatedPlayer.isDefending = false;
              // Reset failures after penalty
              updatedPlayer.cellFailures[cellIdx] = 0;
              
              // Remove from cell active players
              const newCells = prev.cells.map((c, i) => {
                  if (i === cellIdx) return { ...c, activePlayers: c.activePlayers.filter(id => id !== pid) };
                  return c;
              });
              
              return { ...prev, cells: newCells, [pKey]: updatedPlayer };
          }

          return { ...prev, [pKey]: updatedPlayer };
      }

      // SUCCESS HANDLING
      // Prevent race condition: If already owned by someone else (unlikely with this logic but good safety)
      // If Stealing or Neutral
      const newCells = prev.cells.map((c, i) => {
        if (i === cellIdx) {
          return { ...c, owner: pid, activePlayers: [], lastInteraction: Date.now() };
        }
        return c;
      });

      const oppKey = pid === 'P1' ? 'p2' : 'p1';
      let newOppState = { ...prev[oppKey] };
      
      // If opponent was in this cell (defending or racing), kick them out
      if (prev[oppKey].activeCell === cellIdx) {
        newOppState.activeCell = null;
        newOppState.isDefending = false; 
      }
      
      const winner = checkWinner(newCells);
      
      // Track duel win for P1 (when the won cell was the duel cell)
      if (roleRef.current === 'HOST' && pid === 'P1' && prev.duelState?.phase === 'RACING' && prev.duelState?.cellId === cellIdx) {
        saveStats(prevStats => ({ ...prevStats, totalDuelWins: (prevStats.totalDuelWins ?? 0) + 1 }));
      }

      if (winner) audio.playWin();

      // In FUN mode, draw a random card for the capturing player (HOST only)
      const drawnCard: FunCardId | null = (gameModeRef.current === 'FUN' && !winner)
        ? FUN_CARDS[Math.floor(Math.random() * FUN_CARDS.length)].id
        : prev[pKey].funCardInHand;

      return {
        ...prev,
        cells: newCells,
        status: winner ? 'FINISHED' : prev.status,
        winner,
        [pKey]: { 
            ...prev[pKey], 
            activeCell: null, 
            isDefending: false,
            cellFailures: { ...prev[pKey].cellFailures, [cellIdx]: 0 }, // Reset failures on success
            funCardInHand: drawnCard,
        },
        [oppKey]: newOppState,
        stealNotification: prev.stealNotification?.cellId === cellIdx ? null : prev.stealNotification,
        // Clear duel if this cell was being dueled
        duelState: prev.duelState?.cellId === cellIdx ? null : prev.duelState,
      };
    });
  };

  const processUseFreeze = (pid: PlayerId) => {
    if (roleRef.current === 'SOLO') return;
    setGameState(prev => {
      const atkKey = pid === 'P1' ? 'p1' : 'p2';
      const defKey = pid === 'P1' ? 'p2' : 'p1';
      const attacker = prev[atkKey];
      if (attacker.freezesRemaining <= 0) return prev;
      // Track freeze usage for P1 (HOST)
      if (roleRef.current === 'HOST' && pid === 'P1') {
        saveStats(prevStats => ({ ...prevStats, totalFreezes: (prevStats.totalFreezes ?? 0) + 1 }));
      }
      audio.playTone(220, 'sine', 400);
      return {
        ...prev,
        [atkKey]: { ...attacker, freezesRemaining: attacker.freezesRemaining - 1 },
        [defKey]: { ...prev[defKey], frozenUntil: Date.now() + 2000 },
      };
    });
  };

  const processUseDuel = (pid: PlayerId) => {
    if (roleRef.current === 'SOLO') return;
    setGameState(prev => {
      const pKey = pid === 'P1' ? 'p1' : 'p2';
      const oppKey = pid === 'P1' ? 'p2' : 'p1';
      if (prev[pKey].duelsRemaining <= 0) return prev;
      if (prev.duelState) return prev; // already a duel in progress

      // Kick opponent out of their current cell
      const oppCellIdx = prev[oppKey].activeCell;
      let cells = prev.cells;
      if (oppCellIdx !== null) {
        cells = cells.map((c, i) =>
          i === oppCellIdx ? { ...c, activePlayers: c.activePlayers.filter(id => id !== prev[oppKey].id) } : c
        );
      }
      // Also kick initiator out of current cell
      const myCellIdx = prev[pKey].activeCell;
      if (myCellIdx !== null) {
        cells = cells.map((c, i) =>
          i === myCellIdx ? { ...c, activePlayers: c.activePlayers.filter(id => id !== prev[pKey].id) } : c
        );
      }

      audio.playTone(440, 'square', 300);
      return {
        ...prev,
        cells,
        [pKey]:    { ...prev[pKey],    duelsRemaining: prev[pKey].duelsRemaining - 1, activeCell: null, isDefending: false },
        [oppKey]:  { ...prev[oppKey],  activeCell: null, isDefending: false },
        duelState: { initiatorId: pid, cellId: null, phase: 'PICKING', pickDeadline: Date.now() + 20000 },
      };
    });
  };

  const processUseFunCard = (pid: PlayerId, cardId: FunCardId) => {
    if (gameModeRef.current !== 'FUN' || roleRef.current === 'SOLO') return;
    if (roleRef.current === 'HOST' && pid === 'P1') {
      saveStats(prevStats => ({ ...prevStats, totalFunCardsUsed: (prevStats.totalFunCardsUsed ?? 0) + 1 }));
    }
    setGameState(prev => {
      const pKey  = pid === 'P1' ? 'p1' : 'p2';
      const oppKey = pid === 'P1' ? 'p2' : 'p1';
      if (prev[pKey].funCardInHand !== cardId) return prev; // Stale or already used

      // Remove card from hand
      let ns = { ...prev, [pKey]: { ...prev[pKey], funCardInHand: null as FunCardId | null } };
      const now = Date.now();

      switch (cardId) {
        case 'EGG': {
          // Blind the opponent's grid overview for 5 seconds
          const key = oppKey === 'p1' ? 'blindP1Until' : 'blindP2Until';
          ns = { ...ns, funCardEffects: { ...ns.funCardEffects, [key]: now + 5000 } };
          break;
        }
        case 'SHUFFLE': {
          // Randomize gameIds of all unowned cells
          const unownedIdx = ns.cells.map((c, i) => c.owner === null ? i : -1).filter(i => i >= 0);
          if (unownedIdx.length > 1) {
            const shuffled = shuffleGames(unownedIdx.map(i => ns.cells[i].gameId));
            const newCells = ns.cells.map((c, i) => {
              const pos = unownedIdx.indexOf(i);
              return pos >= 0 ? { ...c, gameId: shuffled[pos] } : c;
            });
            ns = { ...ns, cells: newCells };
          }
          break;
        }
        case 'ZAP': {
          // Knock opponent out of their current cell instantly
          const opp = prev[oppKey];
          if (opp.activeCell !== null) {
            const ci = opp.activeCell;
            const newCells = ns.cells.map((c, i) =>
              i === ci ? { ...c, activePlayers: c.activePlayers.filter(id => id !== prev[oppKey].id) } : c
            );
            ns = {
              ...ns,
              cells: newCells,
              [oppKey]: { ...prev[oppKey], activeCell: null, isDefending: false, challengeStartTime: 0 },
            };
            if (ns.stealNotification?.challengerId === prev[oppKey].id || ns.stealNotification?.defenderId === prev[oppKey].id) {
              ns = { ...ns, stealNotification: null };
            }
          }
          break;
        }
        case 'HARD_MODE': {
          // Force EXPERT difficulty on opponent for 15 seconds
          const key = oppKey === 'p1' ? 'hardModeP1Until' : 'hardModeP2Until';
          ns = { ...ns, funCardEffects: { ...ns.funCardEffects, [key]: now + 15000 } };
          break;
        }
        case 'FLIP': {
          // Flip opponent's screen upside-down for 5 seconds
          const key = oppKey === 'p1' ? 'flipP1Until' : 'flipP2Until';
          ns = { ...ns, funCardEffects: { ...ns.funCardEffects, [key]: now + 5000 } };
          break;
        }
        case 'BOMB': {
          // Reset a random opponent-owned cell to neutral
          const oppCellIndices = ns.cells.map((c, i) => c.owner === prev[oppKey].id ? i : -1).filter(i => i >= 0);
          if (oppCellIndices.length > 0) {
            const target = oppCellIndices[Math.floor(Math.random() * oppCellIndices.length)];
            const newCells = ns.cells.map((c, i) => i === target ? { ...c, owner: null, activePlayers: [] } : c);
            if (prev[oppKey].activeCell === target) {
              ns = { ...ns, [oppKey]: { ...prev[oppKey], activeCell: null, isDefending: false } };
            }
            ns = { ...ns, cells: newCells };
          }
          break;
        }
        case 'REROLL': {
          // Change opponent's active cell to a random different mini-game
          const opp = prev[oppKey];
          const targetIdx = opp.activeCell !== null
            ? opp.activeCell
            : (() => {
                const unowned = ns.cells.map((c, i) => c.owner === null ? i : -1).filter(i => i >= 0);
                return unowned.length > 0 ? unowned[Math.floor(Math.random() * unowned.length)] : -1;
              })();
          if (targetIdx >= 0) {
            const currentGameId = ns.cells[targetIdx].gameId;
            const otherGames = getOnlineAllowedGameIds().filter(id => id !== currentGameId);
            if (otherGames.length > 0) {
              const newGameId = otherGames[Math.floor(Math.random() * otherGames.length)];
              ns = { ...ns, cells: ns.cells.map((c, i) => i === targetIdx ? { ...c, gameId: newGameId } : c) };
            }
          }
          break;
        }
        case 'LEECH': {
          // Instantly claim a random unclaimed cell (skipping opponent's active cell)
          const leechTargets = ns.cells.map((c, i) => (c.owner === null && prev[oppKey].activeCell !== i) ? i : -1).filter(i => i >= 0);
          if (leechTargets.length > 0) {
            const target = leechTargets[Math.floor(Math.random() * leechTargets.length)];
            const myPlayerId = prev[pKey].id;
            const newCells = ns.cells.map((c, i) => i === target ? { ...c, owner: myPlayerId, activePlayers: [] } : c);
            ns = { ...ns, cells: newCells };
            const leechWinner = checkWinner(ns.cells);
            if (leechWinner) ns = { ...ns, winner: leechWinner, status: 'FINISHED' as const };
          }
          break;
        }
        case 'ICE': {
          // Freeze opponent for 3.5 seconds
          ns = { ...ns, [oppKey]: { ...prev[oppKey], frozenUntil: now + 3500 } };
          break;
        }
        case 'SWAP': {
          // Swap one random your-owned cell with one random opponent-owned cell
          const myPlayerId = prev[pKey].id;
          const oppPlayerId = prev[oppKey].id;
          const myCells  = ns.cells.map((c, i) => c.owner === myPlayerId  ? i : -1).filter(i => i >= 0);
          const oppCells = ns.cells.map((c, i) => c.owner === oppPlayerId ? i : -1).filter(i => i >= 0);
          if (myCells.length > 0 && oppCells.length > 0) {
            const myTarget  = myCells[Math.floor(Math.random() * myCells.length)];
            const oppTarget = oppCells[Math.floor(Math.random() * oppCells.length)];
            ns = { ...ns, cells: ns.cells.map((c, i) => {
              if (i === myTarget)  return { ...c, owner: oppPlayerId, activePlayers: [] };
              if (i === oppTarget) return { ...c, owner: myPlayerId,  activePlayers: [] };
              return c;
            })};
          }
          break;
        }
      }

      audio.playTone(880, 'sine', 250);
      return ns;
    });
  };

  const processDuelPickCell = (pid: PlayerId, cellIndex: number) => {    if (roleRef.current === 'SOLO') return;
    setGameState(prev => {
      if (!prev.duelState || prev.duelState.phase !== 'PICKING') return prev;
      if (prev.duelState.initiatorId !== pid) return prev;
      // Cell must be unowned
      const cell = prev.cells[cellIndex];
      if (!cell || cell.owner !== null) return prev;

      const oppKey = pid === 'P1' ? 'p2' : 'p1';
      const pKey   = pid === 'P1' ? 'p1' : 'p2';
      const now = Date.now();

      const newCells = prev.cells.map((c, i) =>
        i === cellIndex ? { ...c, activePlayers: [prev[pKey].id, prev[oppKey].id] } : c
      );

      audio.playTone(660, 'sine', 200);
      return {
        ...prev,
        cells: newCells,
        [pKey]:   { ...prev[pKey],   activeCell: cellIndex, challengeStartTime: now, lastInputTime: now, isDefending: false },
        [oppKey]: { ...prev[oppKey], activeCell: cellIndex, challengeStartTime: now, lastInputTime: now, isDefending: false },
        duelState: { ...prev.duelState, cellId: cellIndex, phase: 'RACING' },
      };
    });
  };

  const sendAction = (action: GameAction) => {
    if (roleRef.current === 'HOST' || roleRef.current === 'SOLO') {
      if (action.type === 'CLICK_CELL') processCellClick('P1', action.cellIndex);
      if (action.type === 'DEFEND') processDefend('P1');
      if (action.type === 'ABANDON_CHALLENGE') processAbandon('P1');
      if (action.type === 'INTERACTION') processInteraction('P1');
      if (action.type === 'COMPLETE_GAME') processGameComplete('P1', action.success);
      if (action.type === 'USE_SKILL' && action.skill === 'FREEZE') processUseFreeze('P1');
      if (action.type === 'USE_SKILL' && action.skill === 'DUEL')   processUseDuel('P1');
      if (action.type === 'DUEL_PICK_CELL') processDuelPickCell('P1', action.cellIndex);
      if (action.type === 'USE_FUN_CARD') processUseFunCard('P1', action.cardId);
    } else {
      if (matchPhaseRef.current !== 'PLAYING') return;
      if (action.type === 'USE_FUN_CARD') {
        saveStats(prevStats => ({ ...prevStats, totalFunCardsUsed: (prevStats.totalFunCardsUsed ?? 0) + 1 }));
      }
      if (connRef.current) {
        guestActionSeqRef.current += 1;
        const seq = guestActionSeqRef.current;
        connRef.current.send({
          type: 'ACTION',
          action,
          actionId: `guest-${seq}-${Date.now()}`,
          seq,
          phase: 'PLAYING'
        });
      }
    }
  };

  // HOST resolves a single RPS round, updates display, and sends result to guest
  const resolveRpsRound = (p1Move: RpsMove, p2Move: RpsMove) => {
    const roundWinner = getRpsRoundWinner(p1Move, p2Move);
    const newScores = { ...rpsScoresRef.current };
    if (roundWinner === 'P1') newScores.P1++;
    else if (roundWinner === 'P2') newScores.P2++;
    rpsScoresRef.current = newScores;

    const round = rpsRoundRef.current;
    const seriesOver = newScores.P1 >= 2 || newScores.P2 >= 2 || round >= 3;
    const hw: 'P1' | 'P2' | 'DRAW' | null = seriesOver
      ? (newScores.P1 > newScores.P2 ? 'P1' : newScores.P2 > newScores.P1 ? 'P2' : 'DRAW')
      : null;

    if (connRef.current) {
      connRef.current.send({ type: 'RPS_RESULT', p1Move, p2Move, roundWinner, round, scores: newScores, headstartWinner: hw, revision: nextAuthorityRevision() });
    }

    const myRoundResult: RpsResult = roundWinner === 'P1' ? 'WIN' : roundWinner === 'P2' ? 'LOSE' : 'DRAW';
    const mySeriesWinner: RpsSeriesWinner | null = hw === null ? null : hw === 'P1' ? 'ME' : hw === 'P2' ? 'OPP' : 'DRAW';
    saveStats(prevStats => ({
      ...prevStats,
      rpsRoundsPlayed: (prevStats.rpsRoundsPlayed ?? 0) + 1,
      rpsRoundsWon: (prevStats.rpsRoundsWon ?? 0) + (myRoundResult === 'WIN' ? 1 : 0),
      rpsRoundsDraw: (prevStats.rpsRoundsDraw ?? 0) + (myRoundResult === 'DRAW' ? 1 : 0),
      rpsSeriesPlayed: (prevStats.rpsSeriesPlayed ?? 0) + (mySeriesWinner ? 1 : 0),
      rpsSeriesWon: (prevStats.rpsSeriesWon ?? 0) + (mySeriesWinner === 'ME' ? 1 : 0),
      rpsSeriesDraw: (prevStats.rpsSeriesDraw ?? 0) + (mySeriesWinner === 'DRAW' ? 1 : 0),
    }));
    setRpsState(prev => ({ ...prev, oppMove: p2Move, roundResult: myRoundResult, myScore: newScores.P1, oppScore: newScores.P2, seriesWinner: mySeriesWinner }));

    setTimeout(() => {
      if (hw !== null) {
        const loser: 'P1' | 'P2' | null = hw === 'P1' ? 'P2' : hw === 'P2' ? 'P1' : null;
        startNewGame('ONLINE', { p1: mySkillPicksRef.current, p2: p2SkillPicksRef.current! }, undefined, loser);
        setAppMode('GAME');
      } else {
        rpsRoundRef.current = round + 1;
        rpsMyPickRef.current = null;
        rpsP2PickRef.current = null;
        setRpsState(prev => ({ ...prev, round: round + 1, myMove: null, oppMove: null, roundResult: null }));
      }
    }, 1800);
  };

  const sendSessionSync = (connection: any, accepted: boolean, reason: 'OK' | 'ROOM_BUSY' | 'SESSION_EXPIRED') => {
    if (!connection?.open) return;
    connection.send({
      type: 'SESSION_SYNC',
      accepted,
      guestSessionId: accepted ? guestSessionIdRef.current : null,
      phase: matchPhaseRef.current,
      revision: authorityRevisionRef.current,
      reason,
      gameMode: gameModeRef.current,
    });
  };

  const acceptGuestConnection = (connection: any, requestedSessionId: string | null) => {
    clearPendingPing();
    const hasExistingSession = guestSessionIdRef.current !== null;
    const isResume = hasExistingSession && requestedSessionId === guestSessionIdRef.current;
    const canCreateFreshSession = !hasExistingSession || matchPhaseRef.current === 'WAITING';

    if (!isResume && !canCreateFreshSession) {
      sendSessionSync(connection, false, 'ROOM_BUSY');
      connection.close?.();
      return;
    }

    const previousConn = connRef.current;
    connRef.current = connection;
    if (previousConn && previousConn !== connection && previousConn.open) previousConn.close();

    if (!isResume) {
      guestSessionIdRef.current = generateGuestSessionId();
      p2BanPickRef.current = null;
      p2SkillPicksRef.current = null;
      rpsP2PickRef.current = null;
      rpsMyPickRef.current = null;
      rpsScoresRef.current = { P1: 0, P2: 0 };
      rpsRoundRef.current = 1;
      setRpsState({ round: 1, myScore: 0, oppScore: 0, myMove: null, oppMove: null, roundResult: null, seriesWinner: null });
      setMyBanPick(null);
      myBanPickRef.current = null;
      setMySkillPicks([]);
      mySkillPicksRef.current = [];
    }

    setConnectionStatus('CONNECTED');
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    lastPacketTime.current = Date.now();
    sendSessionSync(connection, true, 'OK');

    if (gameState.status !== 'IDLE') {
      setGameState(prev => ({ ...prev, p2: { ...prev.p2, lastHeartbeat: Date.now() } }));
    }

    if (!isResume && matchPhaseRef.current === 'WAITING') {
      sendAuthoritativePhase('BAN_PICK');
    } else {
      replayAuthoritativeStateTo(connection);
    }

    persistHostResumeSession();
  };

  const handleGuestMessage = (connection: any, raw: unknown) => {
    // HOST RECEIVES MESSAGE — validate before trusting any peer data
    const msg = sanitizeNetworkMessage(raw);
    if (!msg) return; // Drop malformed messages silently
    lastPacketTime.current = Date.now();

    if (msg.type === 'JOIN_REQUEST') {
      acceptGuestConnection(connection, msg.guestSessionId);
      return;
    }

    if (connection !== connRef.current) return;

    if (msg.type === 'PING') {
      connection.send({ type: 'PONG', pingId: msg.pingId, sentAt: msg.sentAt });
      return;
    }

    if (msg.type === 'PONG') {
      handleProbePong(msg.pingId, msg.sentAt);
      return;
    }

    const rl = guestRateLimiter.current;
    if (msg.type === 'HEARTBEAT') {
      if (!rl.allow('hb', 3, 1000)) return;
      suppressNextSyncRef.current = true;
      setGameState(prev => ({
          ...prev,
          p2: { ...prev.p2, lastHeartbeat: Date.now() }
      }));
    }
    else if (msg.type === 'ACTION') {
      if (matchPhaseRef.current !== 'PLAYING' || msg.phase !== 'PLAYING') return;
      if (msg.seq <= lastGuestActionSeqRef.current) return;
      if (guestActionIdsRef.current.has(msg.actionId)) return;
      lastGuestActionSeqRef.current = msg.seq;
      rememberGuestActionId(msg.actionId);

      const { action } = msg;
      if (action.type === 'COMPLETE_GAME' && !rl.allow('complete',  2, 2000)) return;
      if (action.type === 'CLICK_CELL'    && !rl.allow('click',    10, 1000)) return;
      if (action.type === 'INTERACTION'   && !rl.allow('interact', 20, 1000)) return;
      if (action.type === 'CLICK_CELL') processCellClick('P2', action.cellIndex);
      if (action.type === 'DEFEND') processDefend('P2');
      if (action.type === 'ABANDON_CHALLENGE') processAbandon('P2');
      if (action.type === 'INTERACTION') processInteraction('P2');
      if (action.type === 'COMPLETE_GAME') processGameComplete('P2', action.success);
      if (action.type === 'USE_SKILL' && action.skill === 'FREEZE') processUseFreeze('P2');
      if (action.type === 'USE_SKILL' && action.skill === 'DUEL')   processUseDuel('P2');
      if (action.type === 'DUEL_PICK_CELL') processDuelPickCell('P2', action.cellIndex);
      if (action.type === 'USE_FUN_CARD') processUseFunCard('P2', action.cardId);
    }
    else if (msg.type === 'BAN_PICK') {
      if (matchPhaseRef.current !== 'BAN_PICK' || msg.phase !== 'BAN_PICK') return;
      if (!rl.allow('ban_pick', 2, 5000)) return;
      if (!ALL_MINI_GAME_IDS.includes(msg.gameId)) return;
      if (p2BanPickRef.current) return;
      p2BanPickRef.current = msg.gameId;
      persistHostResumeSession();
      if (myBanPickRef.current) {
        sendAuthoritativePhase('SKILL_PICK');
      }
    }
    else if (msg.type === 'SKILL_PICK') {
      if (matchPhaseRef.current !== 'SKILL_PICK' || msg.phase !== 'SKILL_PICK') return;
      if (!rl.allow('skill_pick', 2, 5000)) return;
      p2SkillPicksRef.current = msg.skills;
      persistHostResumeSession();
      const hostPicks = mySkillPicksRef.current;
      if (hostPicks.length === 2) {
        rpsMyPickRef.current = null;
        rpsP2PickRef.current = null;
        rpsScoresRef.current = { P1: 0, P2: 0 };
        rpsRoundRef.current = 1;
        setRpsState({ round: 1, myScore: 0, oppScore: 0, myMove: null, oppMove: null, roundResult: null, seriesWinner: null });
        sendAuthoritativePhase('RPS');
      }
    }
    else if (msg.type === 'RPS_PICK') {
      if (matchPhaseRef.current !== 'RPS' || msg.phase !== 'RPS') return;
      if (!rl.allow('rps_pick', 5, 5000)) return;
      rpsP2PickRef.current = msg.move;
      if (rpsMyPickRef.current) {
        resolveRpsRound(rpsMyPickRef.current, msg.move);
      }
    }
    else if (msg.type === 'RESTART_REQUEST') {
      if (matchPhaseRef.current !== 'RESULT') return;
      if (!rl.allow('restart_request', 2, 10000)) return;
      setRematchInviteFrom('P2');
      setRematchStatus('NONE');
    }
    else if (msg.type === 'RESTART_RESPONSE') {
      if (matchPhaseRef.current !== 'RESULT') return;
      if (!rl.allow('restart_response', 4, 10000)) return;
      setRematchInviteFrom(null);
      if (msg.accepted) {
        startHostRematch();
      } else {
        setRematchStatus('DECLINED');
      }
    }
  };

  const connectHostRelayTransport = (code: string, isResume: boolean) => {
    clearPendingPing();
    clearHostReconnectTimer();
    teardownRelayChannel();

    const previousPeer = peerRef.current;
    if (previousPeer && !previousPeer.destroyed) previousPeer.destroy();
    peerRef.current = null;
    connRef.current = null;

    if (!supabase) {
      setIsConnecting(false);
      setConnectionStatus('DISCONNECTED');
      setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
      return;
    }

    transportRef.current = 'SUPABASE';
    relayClientIdRef.current = createRelayClientId();
    relayGuestIdRef.current = null;
    timeOffsetRef.current = 0;
    lastPacketTime.current = Date.now();

    roleRef.current = 'HOST';
    setMyId('P1');
    setRoomIdLocal(code);
    setError(null);
    setIsConnecting(!isResume);

    const channel = supabase.channel(`${relayChannelPrefix}${code}`, {
      config: { broadcast: { self: false } },
    });
    relayChannelRef.current = channel;

    channel.on('broadcast', { event: relayBroadcastEvent }, (event: any) => {
      if (relayChannelRef.current !== channel) return;
      const payload = event?.payload;
      if (!payload || typeof payload !== 'object') return;

      const from = typeof payload.from === 'string' ? payload.from : '';
      if (!from || from === relayClientIdRef.current) return;

      const to = typeof payload.to === 'string' || payload.to === null ? payload.to : null;
      if (to && to !== 'HOST' && to !== relayClientIdRef.current) return;

      const connection = getRelayConnectionForGuest(from);
      handleGuestMessage(connection, payload.message);
    });

    channel.subscribe((status: string) => {
      if (relayChannelRef.current !== channel) return;

      if (status === 'SUBSCRIBED') {
        hostReconnectAttemptRef.current = 0;
        setIsConnecting(false);
        setConnectionStatus(guestSessionIdRef.current ? 'RECONNECTING' : 'CONNECTED');
        if (!isResume) setMatchPhaseAndUi('WAITING');
        persistHostResumeSession();
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (manualDisconnectRef.current) return;
        setIsConnecting(false);
        setConnectionStatus('RECONNECTING');
        scheduleHostReconnect(code);
      }
    });
  };

  const connectGuestRelayTransport = (code: string, isResume: boolean) => {
    const INITIAL_CONNECT_TIMEOUT_MS = 12000;

    clearPendingPing();
    teardownRelayChannel();

    const previousPeer = peerRef.current;
    if (previousPeer && !previousPeer.destroyed) previousPeer.destroy();
    peerRef.current = null;

    if (!supabase) {
      setIsConnecting(false);
      setConnectionStatus('DISCONNECTED');
      setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
      return;
    }

    transportRef.current = 'SUPABASE';
    relayClientIdRef.current = createRelayClientId();
    relayGuestIdRef.current = null;

    roleRef.current = 'GUEST';
    setMyId('P2');
    setRoomIdLocal(code);
    lastPacketTime.current = Date.now();

    let initialConnectTimerId: number | null = null;
    const clearInitialConnectTimer = () => {
      if (initialConnectTimerId !== null) {
        window.clearTimeout(initialConnectTimerId);
        initialConnectTimerId = null;
      }
    };

    if (!isResume) {
      clearGuestResumeSession();
      setIsConnecting(true);
      setError(null);
      setMyBanPick(null);
      myBanPickRef.current = null;
      setMySkillPicks([]);
      initialConnectTimerId = window.setTimeout(() => {
        setIsConnecting(false);
        setConnectionStatus('DISCONNECTED');
        setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
      }, INITIAL_CONNECT_TIMEOUT_MS);
    } else {
      setIsConnecting(false);
      setConnectionStatus('RECONNECTING');
    }

    const channel = supabase.channel(`${relayChannelPrefix}${code}`, {
      config: { broadcast: { self: false } },
    });
    relayChannelRef.current = channel;

    connRef.current = {
      open: true,
      send: (payload: unknown) => sendRelayPacket('HOST', payload),
      close: () => {
        if (relayChannelRef.current === channel) teardownRelayChannel();
      },
    };

    channel.on('broadcast', { event: relayBroadcastEvent }, (event: any) => {
      if (relayChannelRef.current !== channel) return;
      const payload = event?.payload;
      if (!payload || typeof payload !== 'object') return;

      const from = typeof payload.from === 'string' ? payload.from : '';
      if (!from || from === relayClientIdRef.current) return;

      const to = typeof payload.to === 'string' || payload.to === null ? payload.to : null;
      if (to && to !== relayClientIdRef.current) return;

      clearInitialConnectTimer();
      handleGuestServerMessage(payload.message);
    });

    channel.subscribe((status: string) => {
      if (relayChannelRef.current !== channel) return;

      if (status === 'SUBSCRIBED') {
        if (!isResume) {
          connRef.current.send({
            type: 'JOIN_REQUEST',
            guestSessionId: guestSessionIdRef.current,
            lastRevision: lastAppliedAuthorityRevisionRef.current,
          });
        }
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (manualDisconnectRef.current) return;
        clearInitialConnectTimer();
        setIsConnecting(false);
        scheduleGuestReconnect();
      }
    });
  };

  const connectHostTransportByMode = (code: string, isResume: boolean) => {
    if (useSupabaseRelay && supabase) {
      connectHostRelayTransport(code, isResume);
      return;
    }
    connectHostTransport(code, isResume);
  };

  const connectGuestTransportByMode = (code: string, isResume: boolean) => {
    if (useSupabaseRelay && supabase) {
      connectGuestRelayTransport(code, isResume);
      return;
    }
    connectGuestTransport(code, isResume);
  };

  const scheduleGuestReconnect = () => {
    if (manualDisconnectRef.current || roleRef.current !== 'GUEST') return;
    clearPendingPing();
    const code = roomIdRef.current;
    if (!code) {
      clearGuestResumeSession();
      setConnectionStatus('DISCONNECTED');
      return;
    }
    if (reconnectTimerRef.current !== null) return;
    if (reconnectAttemptRef.current >= MAX_GUEST_RECONNECT_ATTEMPTS) {
      clearGuestResumeSession();
      setConnectionStatus('DISCONNECTED');
      setError('Reconnect failed');
      setMatchPhaseLocal('WAITING');
      setAppMode('LOBBY');
      return;
    }

    reconnectAttemptRef.current += 1;
    setReconnectAttempt(reconnectAttemptRef.current);
    setConnectionStatus('RECONNECTING');
    const delay = Math.min(1500 * reconnectAttemptRef.current, 5000);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectGuestTransportByMode(code, true);
    }, delay);
  };

  const scheduleHostReconnect = (code: string) => {
    if (manualDisconnectRef.current || roleRef.current !== 'HOST') return;
    if (hostReconnectTimerRef.current !== null) return;
    if (hostReconnectAttemptRef.current >= MAX_HOST_RECONNECT_ATTEMPTS) {
      clearHostResumeSession();
      setConnectionStatus('DISCONNECTED');
      setError('Conn Error');
      setMatchPhaseLocal('WAITING');
      setAppMode('LOBBY');
      return;
    }

    hostReconnectAttemptRef.current += 1;
    const delay = Math.min(1000 * hostReconnectAttemptRef.current, 5000);
    hostReconnectTimerRef.current = window.setTimeout(() => {
      hostReconnectTimerRef.current = null;
      connectHostTransportByMode(code, true);
    }, delay);
  };

  const handleGuestServerMessage = (raw: unknown) => {
    const data = sanitizeNetworkMessage(raw);
    if (!data) return;
    lastPacketTime.current = Date.now();

    if (data.type === 'PING') {
      connRef.current?.send({ type: 'PONG', pingId: data.pingId, sentAt: data.sentAt });
      return;
    }

    if (data.type === 'PONG') {
      handleProbePong(data.pingId, data.sentAt);
      return;
    }

    if (data.type === 'SESSION_SYNC') {
      if (!data.accepted || !data.guestSessionId) {
        clearGuestResumeSession();
        clearReconnectTimer();
        setIsConnecting(false);
        setConnectionStatus('DISCONNECTED');
        setError(data.reason === 'ROOM_BUSY' ? 'Room busy' : 'Session expired');
        setMatchPhaseLocal('WAITING');
        setAppMode('LOBBY');
        return;
      }
      guestSessionIdRef.current = data.guestSessionId;
      authorityRevisionRef.current = Math.max(authorityRevisionRef.current, data.revision);
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      clearReconnectTimer();
      setIsConnecting(false);
      setConnectionStatus('CONNECTED');
      setError(null);
      gameModeRef.current = data.gameMode ?? 'STANDARD';
      setMatchPhaseAndUi(data.phase);
      persistGuestResumeSession(data.phase, data.revision);
      return;
    }

    if (data.type === 'STATE_UPDATE') {
        if (!shouldApplyAuthoritativeMessage(data.revision)) return;
        const previousPhase = matchPhaseRef.current;
        noteRemoteRevision(data.revision);
        setGameState(data.state);
        if (data.phase === 'BAN_PICK' && previousPhase !== 'BAN_PICK') {
          resetLocalRoundStateForBanPick();
        }
        if (data.phase === 'SKILL_PICK' && previousPhase !== 'SKILL_PICK') {
          resetLocalRoundStateForSkillPick();
        }
        setMatchPhaseAndUi(data.phase);
        setConnectionStatus('CONNECTED');
        if (data.phase !== previousPhase) persistGuestResumeSession(data.phase, data.revision);
        if (data.serverTime) {
            const now = Date.now();
            timeOffsetRef.current = now - data.serverTime;
        }
    }
    else if (data.type === 'BAN_PHASE') {
      if (!shouldApplyAuthoritativeMessage(data.revision)) return;
      noteRemoteRevision(data.revision);
      resetLocalRoundStateForBanPick();
      setConnectionStatus('CONNECTED');
      setMatchPhaseAndUi('BAN_PICK');
      persistGuestResumeSession('BAN_PICK', data.revision);
    }
    else if (data.type === 'SKILL_PICK_PHASE') {
      if (!shouldApplyAuthoritativeMessage(data.revision)) return;
      noteRemoteRevision(data.revision);
      resetLocalRoundStateForSkillPick();
      setConnectionStatus('CONNECTED');
      setMatchPhaseAndUi('SKILL_PICK');
      persistGuestResumeSession('SKILL_PICK', data.revision);
    }
    else if (data.type === 'RPS_PHASE') {
      if (!shouldApplyAuthoritativeMessage(data.revision)) return;
      noteRemoteRevision(data.revision);
      rpsMyPickRef.current = null;
      rpsScoresRef.current = { P1: 0, P2: 0 };
      rpsRoundRef.current = 1;
      setRpsState({ round: 1, myScore: 0, oppScore: 0, myMove: null, oppMove: null, roundResult: null, seriesWinner: null });
      setConnectionStatus('CONNECTED');
      setMatchPhaseAndUi('RPS');
      persistGuestResumeSession('RPS', data.revision);
    }
    else if (data.type === 'RPS_RESULT') {
      if (!shouldApplyAuthoritativeMessage(data.revision)) return;
      noteRemoteRevision(data.revision);
      setConnectionStatus('CONNECTED');
      persistGuestResumeSession(matchPhaseRef.current, data.revision);
      const myRoundResult: RpsResult = data.roundWinner === 'P2' ? 'WIN' : data.roundWinner === 'P1' ? 'LOSE' : 'DRAW';
      const mySeriesWinner: RpsSeriesWinner | null = data.headstartWinner === null ? null
        : data.headstartWinner === 'P2' ? 'ME'
        : data.headstartWinner === 'P1' ? 'OPP'
        : 'DRAW';
      saveStats(prevStats => ({
        ...prevStats,
        rpsRoundsPlayed: (prevStats.rpsRoundsPlayed ?? 0) + 1,
        rpsRoundsWon: (prevStats.rpsRoundsWon ?? 0) + (myRoundResult === 'WIN' ? 1 : 0),
        rpsRoundsDraw: (prevStats.rpsRoundsDraw ?? 0) + (myRoundResult === 'DRAW' ? 1 : 0),
        rpsSeriesPlayed: (prevStats.rpsSeriesPlayed ?? 0) + (mySeriesWinner ? 1 : 0),
        rpsSeriesWon: (prevStats.rpsSeriesWon ?? 0) + (mySeriesWinner === 'ME' ? 1 : 0),
        rpsSeriesDraw: (prevStats.rpsSeriesDraw ?? 0) + (mySeriesWinner === 'DRAW' ? 1 : 0),
      }));
      setRpsState(prev => ({
        ...prev,
        round: data.round,
        myScore: data.scores.P2,
        oppScore: data.scores.P1,
        oppMove: data.p1Move,
        roundResult: myRoundResult,
        seriesWinner: mySeriesWinner,
      }));
      if (data.headstartWinner === null) {
        setTimeout(() => {
          rpsMyPickRef.current = null;
          setRpsState(prev => ({ ...prev, round: data.round + 1, myMove: null, oppMove: null, roundResult: null }));
        }, 1800);
      }
    }
    else if (data.type === 'RESTART_REQUEST') {
      if (matchPhaseRef.current !== 'RESULT') return;
      setRematchInviteFrom('P1');
      setRematchStatus('NONE');
    }
    else if (data.type === 'RESTART_RESPONSE') {
      if (matchPhaseRef.current !== 'RESULT') return;
      setRematchInviteFrom(null);
      if (data.accepted) {
        setRematchStatus('WAIT_HOST');
      } else {
        setRematchStatus('DECLINED');
      }
    }
  };

  const connectHostTransport = (code: string, isResume: boolean) => {
    clearPendingPing();
    clearHostReconnectTimer();
    transportRef.current = 'PEER';
    const previousPeer = peerRef.current;
    const peer = createPeerClient(`gridrush-${code}`);
    peerRef.current = peer;
    if (previousPeer && previousPeer !== peer && !previousPeer.destroyed) previousPeer.destroy();

    roleRef.current = 'HOST';
    setMyId('P1');
    setRoomIdLocal(code);
    timeOffsetRef.current = 0;
    lastPacketTime.current = Date.now();
    setError(null);
    setIsConnecting(!isResume);

    peer.on('open', () => {
      if (peer !== peerRef.current) return;
      hostReconnectAttemptRef.current = 0;
      setIsConnecting(false);
      setConnectionStatus(guestSessionIdRef.current ? 'RECONNECTING' : 'CONNECTED');
      if (!isResume) {
        setMatchPhaseAndUi('WAITING');
      }
      persistHostResumeSession();
    });

    peer.on('connection', (conn: any) => {
      conn.on('data', (data: unknown) => handleGuestMessage(conn, data));
      conn.on('close', () => {
        if (conn !== connRef.current) return;
        connRef.current = null;
        setConnectionStatus('RECONNECTING');
        setGameState(prev => ({ ...prev, p2: { ...prev.p2, lastHeartbeat: 0 } }));
        persistHostResumeSession();
      });
    });

    peer.on('error', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      setIsConnecting(false);
      setConnectionStatus('RECONNECTING');
      scheduleHostReconnect(code);
    });

    peer.on('disconnected', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      setConnectionStatus('RECONNECTING');
      scheduleHostReconnect(code);
    });

    peer.on('close', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      setConnectionStatus('RECONNECTING');
      scheduleHostReconnect(code);
    });
  };

  const connectGuestTransport = (code: string, isResume: boolean) => {
    const INITIAL_CONNECT_TIMEOUT_MS = 12000;
    clearPendingPing();
    transportRef.current = 'PEER';
    const previousConn = connRef.current;
    connRef.current = null;
    const previousPeer = peerRef.current;
    const peer = createPeerClient();
    peerRef.current = peer;
    if (previousConn && previousConn.open) previousConn.close();
    if (previousPeer && previousPeer !== peer && !previousPeer.destroyed) previousPeer.destroy();

    let initialConnectTimerId: number | null = null;
    const clearInitialConnectTimer = () => {
      if (initialConnectTimerId !== null) {
        window.clearTimeout(initialConnectTimerId);
        initialConnectTimerId = null;
      }
    };

    roleRef.current = 'GUEST';
    setMyId('P2');
    setRoomIdLocal(code);
    lastPacketTime.current = Date.now();

    if (!isResume) {
      clearGuestResumeSession();
      setIsConnecting(true);
      setError(null);
      setMyBanPick(null);
      myBanPickRef.current = null;
      setMySkillPicks([]);
      initialConnectTimerId = window.setTimeout(() => {
        if (peer !== peerRef.current || manualDisconnectRef.current) return;
        setIsConnecting(false);
        setConnectionStatus('DISCONNECTED');
        setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
      }, INITIAL_CONNECT_TIMEOUT_MS);
    } else {
      setIsConnecting(false);
      setConnectionStatus('RECONNECTING');
    }

    peer.on('open', () => {
      if (peer !== peerRef.current) return;
      const conn = peer.connect(`gridrush-${code}`);
      connRef.current = conn;

      conn.on('open', () => {
        if (conn !== connRef.current) return;
        clearInitialConnectTimer();
        setIsConnecting(false);
        lastPacketTime.current = Date.now();
        conn.send({
          type: 'JOIN_REQUEST',
          guestSessionId: guestSessionIdRef.current,
          lastRevision: lastAppliedAuthorityRevisionRef.current,
        });
      });

      conn.on('data', (raw: unknown) => {
        if (conn !== connRef.current) return;
        handleGuestServerMessage(raw);
      });

      conn.on('error', () => {
        if (conn !== connRef.current || manualDisconnectRef.current) return;
        clearInitialConnectTimer();
        setIsConnecting(false);
        setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
        scheduleGuestReconnect();
      });

      conn.on('close', () => {
        if (conn !== connRef.current || manualDisconnectRef.current) return;
        clearInitialConnectTimer();
        connRef.current = null;
        scheduleGuestReconnect();
      });
    });

    peer.on('error', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      clearInitialConnectTimer();
      setIsConnecting(false);
      setError(t.conn_signal_failed ?? 'Cannot reach signaling server. Check network and retry.');
      scheduleGuestReconnect();
    });

    peer.on('disconnected', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      clearInitialConnectTimer();
      scheduleGuestReconnect();
    });

    peer.on('close', () => {
      if (peer !== peerRef.current || manualDisconnectRef.current) return;
      clearInitialConnectTimer();
      scheduleGuestReconnect();
    });
  };

  const setupHost = (gameMode: GameMode = 'STANDARD') => {
    gameModeRef.current = gameMode;
    manualDisconnectRef.current = false;
    clearGuestResumeSession();
    clearHostResumeSession();
    resetOnlineProtocolState();
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
    const code = Math.floor(Math.random() * 9000 + 1000).toString();
    connectHostTransportByMode(code, false);
  };

  const joinGame = (code: string, gameMode: GameMode = 'STANDARD') => {
    if (!isValidRoomCode(code)) { setError('Invalid room code'); return; }
    gameModeRef.current = gameMode; // Will be confirmed/overridden by HOST SESSION_SYNC
    manualDisconnectRef.current = false;
    clearHostResumeSession();
    resetOnlineProtocolState();
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
    connectGuestTransportByMode(code, false);
  };

  const resetRematchUiState = () => {
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
  };

  const resetLocalRoundStateForSkillPick = () => {
    setMySkillPicks([]);
    mySkillPicksRef.current = [];
    rpsMyPickRef.current = null;
    rpsP2PickRef.current = null;
    rpsScoresRef.current = { P1: 0, P2: 0 };
    rpsRoundRef.current = 1;
    setRpsState({ round: 1, myScore: 0, oppScore: 0, myMove: null, oppMove: null, roundResult: null, seriesWinner: null });
    setRematchInviteFrom(null);
    setRematchStatus('NONE');
  };

  const resetLocalRoundStateForBanPick = () => {
    setMyBanPick(null);
    myBanPickRef.current = null;
    p2BanPickRef.current = null;
    p2SkillPicksRef.current = null;
    resetLocalRoundStateForSkillPick();
  };

  const startHostRematch = () => {
    resetLocalRoundStateForBanPick();
    resetRematchUiState();
    setGameState(DEFAULT_GAME_STATE);
    sendAuthoritativePhase('BAN_PICK');
  };

  const respondRematchInvite = (accepted: boolean) => {
    if (roleRef.current === 'SOLO' || !rematchInviteFrom) return;
    if (!connRef.current?.open) return;

    connRef.current.send({ type: 'RESTART_RESPONSE', accepted });
    setRematchInviteFrom(null);

    if (!accepted) {
      setRematchStatus('NONE');
      return;
    }

    if (roleRef.current === 'HOST') {
      startHostRematch();
    } else {
      resetLocalRoundStateForBanPick();
      setRematchStatus('WAIT_HOST');
    }
  };

  const handleRematch = () => {
    audio.playClick();
    if (tutorialActiveRef.current) {
      startOnlineTutorialMatch();
      return;
    }
    if (roleRef.current === 'SOLO') {
      startNewGame('SOLO', undefined, soloDifficultyRef.current);
      return;
    }
    if (matchPhaseRef.current !== 'RESULT') return;
    if (!connRef.current?.open || rematchStatus === 'REQUEST_SENT') return;

    resetRematchUiState();
    setRematchStatus('REQUEST_SENT');
    connRef.current.send({ type: 'RESTART_REQUEST' });
  };

  const resetGame = () => {
    const returnToLobby = tutorialActiveRef.current;
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    clearGuestResumeSession();
    clearHostResumeSession();
    if (peerRef.current) peerRef.current.destroy();
    teardownRelayChannel();
    clearTutorialMode(false);
    resetOnlineProtocolState();
    setGameState(DEFAULT_GAME_STATE);
    setMyId(null);
    setRoomIdLocal(null);
    setIsConnecting(false);
    setConnectionStatus('CONNECTED');
    roleRef.current = 'NONE';
    setError(null);
    resetRematchUiState();
    setAppMode(returnToLobby ? 'LOBBY' : 'MENU');
    audio.playClick();
  };

  // --- Render ---

  if (appMode === 'MENU') {
    return (
      <div className="w-full h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-300">
        {showRules && <RulesModal onClose={closeRulesModal} t={t} />}
        {showSettings && <SettingsModal settings={settings} onUpdate={saveSettings} onClearData={clearData} onClose={() => setShowSettings(false)} t={t} />}
        {showAchievements && <AchievementsModal stats={stats} language={settings.language} onClose={() => setShowAchievements(false)} t={t} />}
        {showStats && <StatsModal stats={stats} onClose={() => setShowStats(false)} t={t} />}
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} t={t} />}
        {showAccount && (
          <AuthModal
            t={t}
            onClose={() => setShowAccount(false)}
            isSupabaseConfigured={hasSupabaseConfig}
            isAuthenticated={Boolean(authSession?.user)}
            authLoading={authLoading}
            busy={authBusy}
            mode={authMode}
            onModeChange={setAuthMode}
            email={authSession?.user?.email ?? null}
            nickname={profile?.nickname ?? ''}
            syncStatus={cloudSyncStatus}
            lastSyncedAt={lastCloudSyncAt}
            error={authError}
            notice={authNotice}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            onSignOut={handleSignOut}
            onSaveNickname={handleSaveNickname}
            onSyncNow={() => pushStatsToCloud(statsRef.current, true)}
          />
        )}
        <MainMenu 
          onShowAccount={() => setShowAccount(true)}
          onOnline={() => setAppMode('LOBBY')}
          onChallenge={() => setAppMode('SOLO_DIFFICULTY')}
          onPractice={() => setAppMode('PRACTICE')}
          onShowRules={() => {
            try { localStorage.setItem(RULES_MODAL_SEEN_KEY, '1'); } catch { /* ignore storage failures */ }
            setShowRules(true);
          }}
          onShowSettings={() => setShowSettings(true)}
          onShowAchievements={() => setShowAchievements(true)}
          onShowStats={() => setShowStats(true)}
          onShowFeedback={() => setShowFeedback(true)}
          accountLabel={accountLabel}
          accountConnected={Boolean(authSession?.user)}
          t={t}
        />
      </div>
    );
  }

  if (appMode === 'PRACTICE') return <PracticeMode onBack={() => setAppMode('MENU')} t={t} language={settings.language} stats={stats} onSaveRecord={handlePracticeRecord} />;

  if (appMode === 'SOLO_DIFFICULTY') {
    return (
      <SoloDifficultyPicker
        t={t}
        stats={stats}
        onBack={() => setAppMode('MENU')}
        onStart={(diff) => startNewGame('SOLO', undefined, diff)}
      />
    );
  }
  
  if (appMode === 'LOBBY') {
    return <OnlineLobby onCreate={setupHost} onJoin={joinGame} onBack={resetGame} onStartTutorial={startOnlineTutorialMatch} isConnecting={isConnecting} error={error} t={t} guidesEnabled={settings.guidesEnabled} />;
  }

  if (appMode === 'BAN_PICK') {
    const handleBanConfirm = (gameId: string) => {
      if (!ALL_MINI_GAME_IDS.includes(gameId)) return;
      if (myBanPickRef.current) return;
      setMyBanPick(gameId);
      myBanPickRef.current = gameId;

      if (roleRef.current === 'GUEST' && connRef.current) {
        connRef.current.send({ type: 'BAN_PICK', gameId, phase: 'BAN_PICK' });
      } else if (roleRef.current === 'HOST') {
        persistHostResumeSession();
        if (p2BanPickRef.current) {
          sendAuthoritativePhase('SKILL_PICK');
        }
      }
    };

    return (
      <BanPickScreen
        t={t}
        language={settings.language}
        waiting={myBanPick !== null}
        selectedGameId={myBanPick}
        onConfirm={handleBanConfirm}
      />
    );
  }

  if (appMode === 'SKILL_PICK') {
    const handleSkillConfirm = (picks: string[]) => {
      setMySkillPicks(picks);
      mySkillPicksRef.current = picks;
      if (roleRef.current === 'GUEST' && connRef.current) {
        // GUEST: send picks to HOST and wait for RPS_PHASE
        connRef.current.send({ type: 'SKILL_PICK', skills: picks, phase: 'SKILL_PICK' });
      } else if (roleRef.current === 'HOST') {
        // HOST: check if P2 already submitted
        if (p2SkillPicksRef.current) {
          // Both picked → enter RPS
          rpsMyPickRef.current = null;
          rpsP2PickRef.current = null;
          rpsScoresRef.current = { P1: 0, P2: 0 };
          rpsRoundRef.current = 1;
          setRpsState({ round: 1, myScore: 0, oppScore: 0, myMove: null, oppMove: null, roundResult: null, seriesWinner: null });
          sendAuthoritativePhase('RPS');
        }
        // else: wait — RPS starts when SKILL_PICK arrives from guest
      }
    };
    return (
      <SkillPickScreen
        t={t}
        waiting={mySkillPicks.length === 2}
        onConfirm={handleSkillConfirm}
      />
    );
  }

  if (appMode === 'RPS') {
    const handleRpsPick = (move: RpsMove) => {
      // Guard against stale UI/state edges: only count picks during actual online RPS phase.
      if (roleRef.current === 'SOLO' || matchPhaseRef.current !== 'RPS') return;
      if (rpsState.myMove !== null || rpsState.seriesWinner !== null) return; // already picked
      rpsMyPickRef.current = move;
      setRpsState(prev => ({ ...prev, myMove: move }));
      saveStats(prevStats => ({
        ...prevStats,
        rpsPickRock: (prevStats.rpsPickRock ?? 0) + (move === 'R' ? 1 : 0),
        rpsPickPaper: (prevStats.rpsPickPaper ?? 0) + (move === 'P' ? 1 : 0),
        rpsPickScissors: (prevStats.rpsPickScissors ?? 0) + (move === 'S' ? 1 : 0),
      }));
      if (roleRef.current === 'GUEST' && connRef.current) {
        connRef.current.send({ type: 'RPS_PICK', move, phase: 'RPS' });
      } else if (roleRef.current === 'HOST') {
        // HOST picks — check if p2 already submitted
        if (rpsP2PickRef.current) {
          resolveRpsRound(move, rpsP2PickRef.current);
        }
      }
    };
    return <RpsScreen t={t} state={rpsState} onPick={handleRpsPick} />;
  }

  if (myId === 'P1' && roomId && gameState.status === 'IDLE') {
    return <WaitingRoom roomId={roomId} onCancel={resetGame} t={t} />;
  }

  // --- GAME VIEW ---
  const me = myId === 'P1' ? gameState.p1 : gameState.p2;
  const opponent = myId === 'P1' ? gameState.p2 : gameState.p1;
  const isSolo = roleRef.current === 'SOLO';
  const isTutorialMatch = tutorialActive;
  const myActiveCellIdx = me.activeCell;
  const tutorialForcedCell = tutorialStep === 'CLICK_CENTER'
    ? 4
    : tutorialStep === 'RACE_TOP_RIGHT'
      ? 2
      : tutorialStep === 'STEAL_TOP_LEFT'
        ? 0
        : tutorialStep === 'CLAIM_FINAL_CELL'
          ? 8
          : null;
  const tutorialGridLocked = isTutorialMatch && (
    tutorialStep === 'WATCH_BOT_CAPTURE' ||
    tutorialStep === 'BOT_CAPTURING' ||
    tutorialStep === 'PREPARE_FREEZE' ||
    tutorialStep === 'USE_FREEZE'
  );
  const freezeTutorialActive = isTutorialMatch && tutorialStep === 'USE_FREEZE';

  // Fun mode effect checks (evaluated at render time using tick-driven re-renders)
  const isFunMode = gameModeRef.current === 'FUN';
  const funEffects = gameState.funCardEffects ?? { blindP1Until: 0, blindP2Until: 0, hardModeP1Until: 0, hardModeP2Until: 0, flipP1Until: 0, flipP2Until: 0 };
  const funNow = Date.now();
  const isBlinded  = isFunMode && (myId === 'P1' ? funEffects.blindP1Until  > funNow : funEffects.blindP2Until  > funNow);
  const isFlipped  = isFunMode && (myId === 'P1' ? funEffects.flipP1Until   > funNow : funEffects.flipP2Until   > funNow);
  const isHardMode = isFunMode && (myId === 'P1' ? funEffects.hardModeP1Until > funNow : funEffects.hardModeP2Until > funNow);
  
  // Logic distinction: 
  // In Online, we play if activeCell is set.
  // In Solo, we ALWAYS play until finished (activeCell is the level index).
  const isPlayingMiniGame = isSolo ? (myActiveCellIdx !== null) : (myActiveCellIdx !== null);
  const miniGameId = isPlayingMiniGame && myActiveCellIdx !== null ? gameState.cells[myActiveCellIdx].gameId : null;
  const handleTutorialCoachAdvance = () => {
    if (!tutorialActiveRef.current) return;
    if (tutorialStep === 'WATCH_BOT_CAPTURE' && !tutorialScriptRef.current.botCaptureStarted) {
      tutorialScriptRef.current.botCaptureStarted = true;
      processCellClick('P2', 0);
      setTutorialStep('BOT_CAPTURING');
      queueTutorialBotAction(4500, () => processGameComplete('P2', true));
      return;
    }

    if (tutorialStep === 'PREPARE_FREEZE' && !tutorialScriptRef.current.topRightRaceStarted) {
      tutorialScriptRef.current.topRightRaceStarted = true;
      processCellClick('P2', 2);
      setTutorialStep('USE_FREEZE');
    }
  };
  const tutorialCoachAdvance = tutorialStep === 'WATCH_BOT_CAPTURE' || tutorialStep === 'PREPARE_FREEZE'
    ? handleTutorialCoachAdvance
    : undefined;

  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {showRules && <RulesModal onClose={closeRulesModal} t={t} />}
      {isTutorialMatch && <OnlineTutorialCoach step={tutorialStep} t={t} onExit={resetGame} onAdvance={tutorialCoachAdvance} />}

      {/* Disconnection / Reconnect Modal */}
      {connectionStatus !== 'CONNECTED' && !isTutorialMatch && (
          <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl animate-bounce-sm">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${connectionStatus === 'RECONNECTING' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                      <Icons.Exit className={`w-8 h-8 ${connectionStatus === 'RECONNECTING' ? 'text-amber-500' : 'text-red-500'}`} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
                    {connectionStatus === 'RECONNECTING'
                      ? (roleRef.current === 'GUEST' ? t.conn_reconnecting_title : t.conn_waiting_title)
                      : t.conn_lost_title}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-2">
                    {connectionStatus === 'RECONNECTING'
                      ? (roleRef.current === 'GUEST' ? t.conn_reconnecting_desc : t.conn_waiting_desc)
                      : t.conn_lost_desc}
                  </p>
                  {connectionStatus === 'RECONNECTING' && roleRef.current === 'GUEST' && reconnectAttempt > 0 && (
                    <p className="text-xs font-mono text-amber-500 mb-6 uppercase tracking-widest">
                      {t.conn_attempt} {reconnectAttempt}/{MAX_GUEST_RECONNECT_ATTEMPTS}
                    </p>
                  )}
                  {!(connectionStatus === 'RECONNECTING' && roleRef.current === 'GUEST' && reconnectAttempt > 0) && <div className="mb-6" />}
                  <button onClick={resetGame} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-red-600 transition-colors">
                      {t.conn_exit_menu}
                  </button>
              </div>
          </div>
      )}

      {/* Achievement Toast */}
      {newAchievement && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 fade-in duration-300">
           <div className="bg-yellow-500 text-white px-6 py-3 rounded-full font-bold shadow-xl flex items-center gap-2 border border-yellow-400">
             <Icons.Trophy className="w-5 h-5" />
             <span>Unlocked: {newAchievement}</span>
           </div>
        </div>
      )}

      {/* Winner Overlay */}
      {gameState.winner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center animate-bounce">
            <h2 className="text-5xl md:text-7xl font-black mb-4 text-white">
              {isSolo ? t.msg_challenge_complete : (gameState.winner === 'DRAW' ? t.msg_draw : (gameState.winner === myId ? t.msg_win : t.msg_lose))}
            </h2>
            {isSolo && <div className="text-3xl font-mono text-yellow-400 mb-6">TIME: {challengeTime}</div>}
            <div className="flex gap-4 mt-8 justify-center flex-wrap">
              <button onClick={handleRematch} className="px-8 py-3 bg-yellow-400 text-black hover:bg-yellow-300 rounded-full transition-colors font-bold uppercase tracking-widest shadow-lg">{isTutorialMatch ? t.online_tutorial_replay : t.game_rematch}</button>
              <button onClick={resetGame} className="px-8 py-3 bg-white text-black hover:bg-slate-200 rounded-full transition-colors font-bold uppercase tracking-widest shadow-lg">{t.conn_exit_menu}</button>
            </div>
            {!isSolo && (
              <div className="mt-4 flex flex-col items-center gap-3">
                {rematchStatus === 'REQUEST_SENT' && (
                  <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">{t.game_rematch_request_sent ?? 'REQUEST SENT...'}</p>
                )}
                {rematchStatus === 'WAIT_HOST' && (
                  <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">{t.game_rematch_wait_host ?? 'WAITING FOR HOST...'}</p>
                )}
                {rematchStatus === 'DECLINED' && (
                  <p className="text-sm font-bold uppercase tracking-widest text-rose-300">{t.game_rematch_declined ?? 'REMATCH DECLINED'}</p>
                )}

                {rematchInviteFrom && (
                  <div className="rounded-2xl border border-white/25 bg-black/40 px-5 py-4 shadow-xl">
                    <p className="text-sm font-bold uppercase tracking-widest text-white mb-3">{t.game_rematch_invite ?? 'OPPONENT INVITED A REMATCH'}</p>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => respondRematchInvite(true)} className="px-5 py-2 rounded-full bg-green-400 text-slate-900 hover:bg-green-300 font-bold uppercase tracking-widest transition-colors">{t.game_rematch_accept ?? 'ACCEPT'}</button>
                      <button onClick={() => respondRematchInvite(false)} className="px-5 py-2 rounded-full bg-rose-500 text-white hover:bg-rose-400 font-bold uppercase tracking-widest transition-colors">{t.game_rematch_decline ?? 'DECLINE'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steal Notification (Only Online) */}
      {gameState.stealNotification && !isSolo && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg pointer-events-none">
          {(() => {
            const { defenderId, expiresAt, cellId } = gameState.stealNotification!;
            // Corrected timer sync for steal notification
            const estimatedServerTime = Date.now() - timeOffsetRef.current;
            const remaining = Math.max(0, Math.ceil((expiresAt - estimatedServerTime) / 1000));
            
            const isDefender = myId === defenderId;
            const bgClass = isDefender ? 'bg-red-500 shadow-red-500/50' : 'bg-blue-500 shadow-blue-500/50';
            const showDefendBtn = isDefender && me.activeCell !== cellId;
            const descTemplate = isDefender
              ? (t.msg_steal_attack_desc ?? 'Opponent is stealing Cell {cell}! Tap DEFEND to contest, or ignore if your current race matters more.')
              : (t.msg_steal_doing_desc ?? 'Stealing Cell {cell} from opponent!');
            const desc = descTemplate.replace('{cell}', String(cellId + 1));

            return (
              <div className={`mx-4 p-5 rounded-2xl ${bgClass} shadow-xl text-white flex justify-between items-center animate-pulse-fast pointer-events-auto`}>
                <div>
                   <h3 className="font-bold uppercase text-lg tracking-wider">{isDefender ? t.msg_steal_attack : t.msg_steal_doing}</h3>
                   <div className="text-sm opacity-90">{desc}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-mono font-black">{remaining}s</span>
                  {showDefendBtn && (
                    <button onClick={() => { audio.playClick(); sendAction({ type: 'DEFEND' }); }} className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:scale-105 active:scale-95 transition-transform shadow-lg">{t.msg_defend}</button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Duel Banner (Only Online) */}
      {gameState.duelState && !isSolo && (() => {
        const ds = gameState.duelState!;
        const amInitiator = myId === ds.initiatorId;

        if (ds.phase === 'PICKING') {
          const pickRemaining = Math.max(0, Math.ceil((ds.pickDeadline - Date.now()) / 1000));
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 rounded-3xl p-6 w-full max-w-md mx-4 text-white shadow-2xl border border-orange-500/50">
                <h2 className="text-2xl font-black uppercase tracking-widest text-orange-400 mb-1 text-center">⚔️ {t.duel_title}</h2>
                {amInitiator ? (
                  <>
                    <p className="text-center text-sm text-slate-400 mb-4">{t.duel_pick_instr} <span className="text-white font-bold">{pickRemaining}s</span></p>
                    <div className="grid grid-cols-3 gap-3">
                      {gameState.cells.map((cell) => {
                        const canPick = cell.owner === null;
                        return (
                          <button key={cell.id}
                            onClick={() => { if (canPick) { audio.playClick(); sendAction({ type: 'DUEL_PICK_CELL', cellIndex: cell.id }); } }}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all ${
                              canPick
                                ? 'bg-orange-600 hover:bg-orange-500 hover:scale-105 cursor-pointer active:scale-95'
                                : 'bg-slate-700 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            {cell.owner ? (
                              <span className={cell.owner === 'P1' ? 'text-blue-400' : 'text-red-400'}>⚑</span>
                            ) : (
                              <span>{cell.id + 1}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-slate-300 mt-4">{t.duel_opp_picking} <span className="font-bold text-white">{pickRemaining}s</span></p>
                )}
              </div>
            </div>
          );
        }

        // RACING phase — just show a small banner
        if (ds.phase === 'RACING' && ds.cellId !== null) {
          return (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <div className="bg-orange-500 text-white px-6 py-2 rounded-full font-black uppercase tracking-widest shadow-xl text-sm">
                ⚔️ {t.duel_racing} — {t.duel_cell} {ds.cellId + 1}
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* HUD */}
      <div className="min-h-20 md:h-24 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2 px-3 md:px-12 py-2 md:py-0 z-10 shrink-0 relative shadow-sm">
         <PlayerBadge player={me} isMe={true} t={t}
           onFreeze={isSolo || (isTutorialMatch && tutorialStep !== 'USE_FREEZE') ? undefined : () => { audio.playClick(); sendAction({ type: 'USE_SKILL', skill: 'FREEZE' }); }}
           onDuel={isSolo || isTutorialMatch ? undefined : () => { audio.playClick(); sendAction({ type: 'USE_SKILL', skill: 'DUEL' }); }}
           oppInGame={opponent.activeCell !== null}
           onUseFunCard={isFunMode && !isSolo ? (cardId) => { audio.playClick(); sendAction({ type: 'USE_FUN_CARD', cardId }); } : undefined}
           highlightFreeze={freezeTutorialActive}
         />
         <div className="flex min-w-0 flex-col items-center">
            {isSolo ? (
                <div className="flex flex-col items-center gap-1">
                    <div className="text-2xl md:text-3xl font-mono font-bold text-slate-800 dark:text-yellow-500">{challengeTime}</div>
                    <div className="text-[9px] md:text-[10px] text-slate-400 font-mono tracking-[0.2em] md:tracking-[0.3em] uppercase">{t.level_progress} {myActiveCellIdx !== null ? myActiveCellIdx + 1 : '-'}/{gameState.cells.length}</div>
                </div>
            ) : (
                <>
                    <div className="text-3xl font-black italic text-slate-100 dark:text-slate-800 tracking-widest absolute center-x top-1/2 -translate-y-1/2 pointer-events-none">VS</div>
                <div className="flex items-center gap-1 md:gap-2 md:mt-4 bg-slate-100 dark:bg-slate-800 px-2 md:px-3 py-1 md:py-1.5 rounded-full max-w-[8.5rem] md:max-w-none">
                        <div className={`w-2 h-2 rounded-full ${connectionStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : connectionStatus === 'RECONNECTING' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
                  <div className="text-[9px] md:text-[10px] text-slate-400 font-mono truncate">{isTutorialMatch ? `${t.online_tutorial_label}: BOT` : `ROOM: ${roomId}`}</div>
                        {isFunMode && <div className="hidden md:block text-[10px] font-bold text-purple-500 uppercase tracking-widest">{t.fun_mode_badge ?? '🎉 FUN'}</div>}
                    </div>
                <div className="hidden md:block">
                  <NetworkQualityPanel
                    t={t}
                    status={connectionStatus}
                    quality={networkQuality}
                    reconnectAttempt={reconnectAttempt}
                  />
                </div>
                </>
            )}
         </div>
         
         {/* Exit Button - Always visible now */}
         <button 
            onClick={resetGame}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 border border-red-200 dark:border-red-800 text-xs font-bold uppercase tracking-wider transition-colors ml-4"
         >
            <Icons.Exit className="w-4 h-4" /> {t.exit_game}
         </button>
         
         {/* Mobile Exit (replaces badge or sits near it) */}
         <div className="md:hidden flex flex-col items-end gap-1">
             {isSolo ? null : <PlayerBadge player={opponent} isMe={false} opponent t={t} />}
             <button onClick={resetGame} className="text-[10px] text-red-500 underline uppercase tracking-widest font-bold">EXIT</button>
         </div>
         
         <div className="hidden md:block">
            {isSolo ? null : <PlayerBadge player={opponent} isMe={false} opponent t={t} />}
         </div>
      </div>

      {/* Game Grid or Solo View */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 md:p-4 relative" style={isFlipped ? { transform: 'rotate(180deg)', transition: 'transform 0.3s' } : undefined}>
         <button onClick={() => {
           audio.playClick();
           try { localStorage.setItem(RULES_MODAL_SEEN_KEY, '1'); } catch { /* ignore storage failures */ }
           setShowRules(true);
         }} className="absolute bottom-4 right-4 md:bottom-6 md:right-6 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-white font-bold transition-all z-20">?</button>

         {/* Blind overlay — affects the whole current gameplay view but keeps interactions enabled */}
         {isBlinded && (
           <div
             className="absolute inset-0 z-40 pointer-events-none"
             style={{ backdropFilter: 'blur(8px) brightness(0.55)', background: 'rgba(10,10,30,0.38)' }}
           />
         )}

         {isPlayingMiniGame && miniGameId ? (
            <div className="w-full max-w-lg max-md:h-full max-md:max-h-[calc(100dvh-6.5rem)] max-md:aspect-auto md:aspect-auto md:h-[600px] flex flex-col z-10">
               <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl relative flex flex-col items-center justify-center flex-1 animate-in zoom-in duration-300 border border-slate-200 dark:border-slate-800">
                  <div className="absolute top-4 left-4 md:top-6 md:left-6 text-[10px] md:text-xs font-mono text-slate-400 tracking-widest uppercase">
                      {isSolo ? `${t.level_progress} ${myActiveCellIdx! + 1}` : `${t.game_playing} ${myActiveCellIdx! + 1}`}
                  </div>
                  
                  {/* Abandon Button for Online Mode */}
                  {!isSolo && !isTutorialMatch && (
                      <button 
                        onClick={() => { audio.playClick(); sendAction({ type: 'ABANDON_CHALLENGE' }); }}
                        className="absolute top-4 right-4 md:top-6 md:right-6 text-[10px] md:text-xs font-bold text-red-500 hover:text-red-600 hover:underline uppercase tracking-widest transition-colors"
                      >
                         Give Up
                      </button>
                  )}

                  <h3 className="text-center text-xl md:text-3xl font-black mb-4 md:mb-10 px-8 md:px-0 text-slate-900 dark:text-white uppercase tracking-widest drop-shadow-sm">{MINI_GAMES.find(g => g.id === miniGameId)?.name}</h3>
                  <div className="w-full min-h-0 flex-1 relative">
                     {/* Frozen overlay — blocks interaction when this player is frozen */}
                     {me.frozenUntil > Date.now() && (
                       <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl"
                            style={{ background: 'rgba(59,130,246,0.45)', backdropFilter: 'blur(3px)' }}
                       >
                         <span className="text-5xl select-none">❄️</span>
                         <span className="text-white font-black text-xl uppercase tracking-widest select-none">FROZEN</span>
                       </div>
                     )}
                     <MiniGameRenderer 
                       type={miniGameId} 
                       playerId={myId!} 
                       onComplete={(success) => sendAction({ type: 'COMPLETE_GAME', success })} 
                       onInteraction={() => sendAction({ type: 'INTERACTION' })}
                       language={settings.language} 
                       difficulty={isSolo ? soloDifficultyRef.current : (isHardMode ? 'EXPERT' : 'HARD')}
                       tutorialEnabled={isTutorialMatch}
                       frozen={me.frozenUntil > Date.now()}
                     />
                  </div>
               </div>
            </div>
         ) : (
            // This grid view only renders for ONLINE mode when no minigame is active
            !isSolo && (
            <div className="relative w-full max-w-md">
            <div className="grid grid-cols-3 gap-3 md:gap-4 w-full aspect-square z-10">
               {gameState.cells.map((cell) => {
                  const isOwnedByMe = cell.owner === myId;
                  const isOwnedByOpp = cell.owner && cell.owner !== myId;
                  
                  // Active Player Checks
                  const isP1Active = gameState.p1.activeCell === cell.id;
                  const isP2Active = gameState.p2.activeCell === cell.id;
                  
                  // Cooldown check for styling
                  const myCooldown = me.cellCooldowns[cell.id] || 0;
                  const isCellCooldown = myCooldown > Date.now();

                  let baseClass = "rounded-2xl flex items-center justify-center relative transition-all duration-300 shadow-lg group border-4";
                  
                  if (isOwnedByMe) {
                      baseClass += myId === 'P1' 
                        ? " bg-blue-100 border-blue-500 dark:bg-blue-900/40 dark:border-blue-500" 
                        : " bg-red-100 border-red-500 dark:bg-red-900/40 dark:border-red-500";
                  } else if (isOwnedByOpp) {
                      baseClass += " bg-slate-200 border-slate-300 dark:bg-slate-800 dark:border-slate-700 opacity-60 grayscale-[0.5]";
                  } else {
                      baseClass += " bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 cursor-pointer active:scale-95";
                  }
                  
                  // Disabled look for cooldown
                  if (isCellCooldown) {
                      baseClass += " opacity-50 cursor-not-allowed grayscale";
                  }

                  const canSteal = isOwnedByOpp && me.stealsRemaining > 0 && !isCellCooldown && me.stealCooldown < Date.now();
                  if (canSteal) baseClass += " hover:border-yellow-400 hover:shadow-yellow-400/50 cursor-crosshair hover:scale-105 z-10";

                  // Corrected Timer Calculation using Time Offset
                  // Estimated Server Time = Local Time - Offset
                  // Duration = Estimated Server Time - Start Time (which is Server Time)
                  const getTimer = (start: number | undefined) => {
                      if (!start) return 0;
                      const estimatedServerTime = Date.now() - timeOffsetRef.current;
                      return Math.max(0, Math.floor((estimatedServerTime - start) / 1000));
                  };
                  
                  const p1Time = isP1Active ? getTimer(gameState.p1.challengeStartTime) : 0;
                  const p2Time = isP2Active ? getTimer(gameState.p2.challengeStartTime) : 0;

                  const tutorialCellAllowed = !isTutorialMatch || (!tutorialGridLocked && (tutorialForcedCell === null || tutorialForcedCell === cell.id));
                  if (isTutorialMatch && tutorialForcedCell === cell.id) {
                    baseClass += ' ring-4 ring-emerald-400 shadow-2xl shadow-emerald-400/20 animate-pulse';
                  } else if (isTutorialMatch && tutorialForcedCell !== null) {
                    baseClass += ' opacity-50';
                  } else if (tutorialGridLocked) {
                    baseClass += ' opacity-50';
                  }

                  return (
                     <div key={cell.id} onClick={() => {
                       if (isTutorialMatch && !tutorialCellAllowed) return;
                       if(!isCellCooldown) { audio.playClick(); sendAction({ type: 'CLICK_CELL', cellIndex: cell.id }); }
                     }} className={baseClass}>
                        {cell.owner === 'P1' && <Icons.Flag className="w-10 h-10 md:w-12 md:h-12 text-blue-500 drop-shadow-sm animate-fade-in" />}
                        {cell.owner === 'P2' && <Icons.Flag className="w-10 h-10 md:w-12 md:h-12 text-red-500 drop-shadow-sm animate-fade-in" />}
                        {!cell.owner && <Icons.Question className="w-7 h-7 md:w-8 md:h-8 text-slate-200 dark:text-slate-700 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />}
                        
                        {/* Status Badges (Top Right) */}
                        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-20 pointer-events-none">
                            {(isP1Active || isP2Active) && (
                                <div className="flex flex-col gap-1">
                                    {isP1Active && (
                                        <div className="bg-blue-600 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-md">
                                            P1: {p1Time}s
                                        </div>
                                    )}
                                    {isP2Active && (
                                        <div className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-md">
                                            P2: {p2Time}s
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {canSteal && (
                           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-sm z-30">
                              <Icons.Sword className="w-10 h-10 text-yellow-400 mb-2 animate-bounce" />
                              <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{t.game_steal}</span>
                           </div>
                        )}
                        
                        {isCellCooldown && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-2xl z-40 backdrop-grayscale">
                                <span className="text-white font-bold text-2xl animate-pulse">{Math.ceil((myCooldown - Date.now())/1000)}s</span>
                            </div>
                        )}
                        
                        <div className="absolute bottom-3 left-4 text-[10px] text-slate-300 dark:text-slate-600 font-mono font-bold">{cell.id + 1}</div>
                     </div>
                  );
               })}
            </div>
            </div>
            )
         )}
      </div>
    </div>
  );
}
