import React, { useState, useEffect, useRef } from 'react';
import { GameState, PlayerId, PlayerState, CellData, StealNotification, NetworkMessage, GameAction, AppSettings, UserStats, Achievement, PracticeConfig, PracticeRecord, GameType, Difficulty } from './types';
import { MINI_GAMES, Icons, TRANSLATIONS, ACHIEVEMENTS_LIST } from './constants';
import { checkWinner, shuffleGames } from './services/gameLogic';
import { MiniGameRenderer } from './components/MiniGames';
import { audio } from './services/audio';

declare global {
  interface Window {
    Peer: any;
  }
}

const INITIAL_PLAYER_STATE = (id: PlayerId, name: string): PlayerState => ({
  id,
  name,
  activeCell: null,
  stealsRemaining: 1,
  isDefending: false,
});

const DEFAULT_GAME_STATE: GameState = {
  status: 'IDLE',
  cells: [],
  p1: INITIAL_PLAYER_STATE('P1', 'Player Blue'),
  p2: INITIAL_PLAYER_STATE('P2', 'Player Red'),
  winner: null,
  stealNotification: null,
};

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'light',
  soundEnabled: true,
  musicEnabled: true,
};

const DEFAULT_STATS: UserStats = {
  onlineWins: 0,
  fastestSoloRun: 0,
  totalSteals: 0,
  totalDefends: 0,
  gamesPlayed: 0,
  unlockedAchievements: [],
  practiceRecords: []
};

const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  difficulty: 'NORMAL',
  isBattlePreset: true,
  tutorialEnabled: false
};

// --- Modals ---

const RulesModal = ({ onClose, t }: { onClose: () => void, t: any }) => (
  <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-lg w-full relative animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => { audio.playClick(); onClose(); }} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
      <h2 className="text-2xl font-bold mb-6 text-center text-slate-900 dark:text-white tracking-widest uppercase">
        {t.rules_title}
      </h2>
      <div className="space-y-6 text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed">
        <p><strong className="text-slate-900 dark:text-white font-semibold">Goal:</strong> {t.rules_goal}</p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
          <strong className="block text-blue-600 dark:text-blue-400 mb-2 font-semibold">🏁 Racing</strong>
          {t.rules_race}
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800">
          <strong className="block text-red-600 dark:text-red-400 mb-2 font-semibold">⚔️ Stealing</strong>
          {t.rules_steal}
        </div>
      </div>
      <button onClick={() => { audio.playClick(); onClose(); }} className="w-full mt-8 bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 font-bold py-3 rounded-xl transition-all shadow-lg">
        OK
      </button>
    </div>
  </div>
);

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
    <div className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800">
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

// --- Main Components ---

const MainMenu = ({ 
  onOnline, 
  onChallenge, 
  onPractice,
  onShowRules,
  onShowSettings,
  onShowAchievements,
  t
}: any) => (
  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
    {/* Top Right Controls */}
    <div className="absolute top-6 right-6 flex gap-3">
      <button 
        onClick={() => { audio.playClick(); onShowAchievements(); }}
        className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-yellow-500 transition-all"
      >
        <Icons.Trophy className="w-5 h-5" />
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowSettings(); }}
        className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all"
      >
        <Icons.Settings className="w-5 h-5" />
      </button>
      <button 
        onClick={() => { audio.playClick(); onShowRules(); }}
        className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-bold transition-all"
      >
        ?
      </button>
    </div>

    <div className="mb-16 text-center">
      <h1 className="text-6xl md:text-8xl font-black mb-4 text-slate-900 dark:text-white tracking-tighter drop-shadow-sm">
        GRID<span className="text-blue-500">RUSH</span>
      </h1>
      <p className="text-slate-400 font-mono text-sm md:text-base tracking-[0.3em] uppercase">{t.menu_subtitle}</p>
    </div>

    <div className="flex flex-col gap-4 w-full max-w-sm">
      <button onClick={() => { audio.playClick(); onOnline(); }} className="group w-full py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Sword className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_online}</span>
      </button>

      <button onClick={() => { audio.playClick(); onChallenge(); }} className="group w-full py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Clock className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_solo}</span>
      </button>

      <button onClick={() => { audio.playClick(); onPractice(); }} className="group w-full py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-slate-100 dark:border-slate-700">
        <Icons.Dumbbell className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_practice}</span>
      </button>

      <button onClick={() => { audio.playClick(); onShowAchievements(); }} className="md:hidden w-full py-5 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-4 text-slate-900 dark:text-white shadow-xl border border-slate-100 dark:border-slate-700">
        <Icons.Trophy className="w-5 h-5 text-yellow-500" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_achievements}</span>
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
  const [paused, setPaused] = useState(false);

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
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950">
             <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
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
                           return (
                               <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                   <div className="flex items-center gap-3">
                                       <div className="text-2xl">{game?.icon}</div>
                                       <div>
                                           <div className="font-bold text-sm text-slate-900 dark:text-white">{game?.name}</div>
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
        if (filterType !== 'ALL' && g.type !== filterType) return false;
        if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
     });

     return (
       <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
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
                              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{game.name}</h3>
                              <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded uppercase">{game.type}</span>
                           </div>
                           <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{game.description}</p>
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
     const currentPB = getPB(selectedGameId, config);

     return (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-50 dark:bg-slate-950">
           <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full animate-fade-in">
              <div className="text-6xl mb-6 drop-shadow-lg">{game.icon}</div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2">{game.name}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-8">{game.description}</p>

              {/* Config Section */}
              <div className="w-full bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-800 space-y-6">
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
     return (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-900">
           {/* Header */}
           <div className="h-16 flex items-center justify-between px-6 bg-slate-800/50 backdrop-blur-md z-20">
              <span className="font-bold text-white/50 text-sm tracking-widest">{MINI_GAMES.find(g => g.id === selectedGameId)?.name}</span>
              <button onClick={() => setPaused(true)} className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors">
                 <Icons.Pause className="w-6 h-6" />
              </button>
           </div>

           {/* Game Area */}
           <div className="flex-1 relative flex flex-col">
              <div className="flex-1 p-4 md:p-8 flex items-center justify-center">
                 <div className="w-full max-w-lg aspect-square bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
                    <MiniGameRenderer 
                       type={selectedGameId} 
                       playerId="P1" 
                       onComplete={handleGameComplete} 
                       language={language}
                       difficulty={config.difficulty}
                       tutorialEnabled={config.tutorialEnabled}
                    />
                 </div>
              </div>
           </div>

           {/* Pause Menu Overlay */}
           {paused && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-fade-in">
                 <h2 className="text-4xl font-black text-white uppercase tracking-widest mb-12">{t.prac_paused}</h2>
                 <div className="flex flex-col gap-4 w-full max-w-xs">
                    <button onClick={() => setPaused(false)} className="bg-white text-slate-900 py-4 rounded-xl font-bold uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-3">
                       <Icons.Play className="w-5 h-5" /> {t.prac_resume}
                    </button>
                    <button onClick={() => { setPaused(false); setStep('DETAIL'); startPractice(); }} className="bg-slate-700 text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-600 transition-colors flex items-center justify-center gap-3">
                       <Icons.Restart className="w-5 h-5" /> {t.prac_restart}
                    </button>
                    <button onClick={() => setStep('DETAIL')} className="bg-red-500/20 text-red-500 border border-red-500/50 py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-red-500/30 transition-colors flex items-center justify-center gap-3">
                       <Icons.Exit className="w-5 h-5" /> {t.prac_quit}
                    </button>
                 </div>
              </div>
           )}
        </div>
     );
  }

  if (step === 'RESULT' && result && selectedGameId) {
     const game = MINI_GAMES.find(g => g.id === selectedGameId)!;
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

const OnlineLobby = ({ onCreate, onJoin, onBack, isConnecting, error, t }: any) => {
  const [joinId, setJoinId] = useState('');

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
      <button onClick={() => { audio.playClick(); onBack(); }} className="absolute top-6 left-6 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-widest text-xs">← Back</button>
      
      <h2 className="text-4xl font-black mb-12 text-slate-900 dark:text-white uppercase tracking-tighter">{t.menu_online}</h2>
      
      {isConnecting ? (
        <div className="flex flex-col items-center animate-fade-in">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-6"></div>
          <p className="text-slate-500 dark:text-slate-400 font-mono text-sm tracking-widest animate-pulse">{t.online_connecting}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-2xl items-stretch animate-fade-in">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 bg-white dark:bg-slate-800 p-8 rounded-2xl flex flex-col items-center shadow-lg border-2 border-transparent hover:border-blue-500 transition-colors group">
              <h3 className="text-lg font-bold mb-2 text-blue-500 uppercase tracking-widest">{t.online_host}</h3>
              <p className="text-xs text-slate-400 text-center mb-8 h-8">{t.online_host_desc}</p>
              <button onClick={() => { audio.playClick(); onCreate(); }} className="w-full py-4 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-blue-500/30 text-white transition-all active:scale-95">{t.online_create}</button>
            </div>
            
            <div className="flex-1 bg-white dark:bg-slate-800 p-8 rounded-2xl flex flex-col items-center shadow-lg border-2 border-transparent hover:border-red-500 transition-colors group">
              <h3 className="text-lg font-bold mb-2 text-red-500 uppercase tracking-widest">{t.online_join}</h3>
              <p className="text-xs text-slate-400 text-center mb-8 h-8">{t.online_join_desc}</p>
              <div className="flex w-full gap-2">
                <input 
                  value={joinId} 
                  onChange={(e) => setJoinId(e.target.value.toUpperCase().slice(0, 4))} 
                  placeholder="CODE" 
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-red-500 rounded-xl px-4 text-center font-mono text-xl focus:outline-none uppercase text-slate-900 dark:text-white placeholder-slate-400 transition-colors" 
                />
                <button onClick={() => { audio.playClick(); onJoin(joinId); }} disabled={joinId.length !== 4} className="px-6 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-red-500/30 transition-all active:scale-95">{t.online_join_btn}</button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-8 text-center max-w-md mx-auto">{t.online_instruction}</p>
        </div>
      )}
      {error && <div className="mt-8 bg-red-50 text-red-500 px-6 py-3 rounded-lg text-sm border border-red-200">{error}</div>}
    </div>
  );
};

const WaitingRoom = ({ roomId, onCancel, t }: { roomId: string, onCancel: () => void, t: any }) => (
  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
    <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl flex flex-col items-center max-w-md w-full animate-fade-in shadow-2xl">
      <h2 className="text-slate-400 mb-4 text-xs font-mono uppercase tracking-widest">Room Code</h2>
      <div className="text-6xl font-mono font-bold tracking-widest text-slate-900 dark:text-white mb-10 select-all cursor-pointer bg-slate-100 dark:bg-slate-900 px-8 py-6 rounded-2xl border border-slate-200 dark:border-slate-700">{roomId}</div>
      <div className="flex items-center gap-3 mb-10">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-blue-500 text-sm font-medium tracking-wide">{t.online_waiting}</span>
      </div>
      <button onClick={() => { audio.playClick(); onCancel(); }} className="text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs uppercase tracking-widest transition-colors">Cancel</button>
    </div>
  </div>
);

const PlayerBadge = ({ player, isMe, opponent, t }: { player: PlayerState, isMe: boolean, opponent?: boolean, t: any }) => {
  const colorClass = player.id === 'P1' ? 'text-blue-500' : 'text-red-500';
  const borderClass = player.id === 'P1' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-red-500 bg-red-50 dark:bg-red-900/20';
  
  return (
    <div className={`flex items-center gap-4 ${opponent ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`w-14 h-14 rounded-2xl border-2 ${borderClass} flex items-center justify-center text-xl font-bold shadow-sm`}>
        <span className={player.id === 'P1' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}>
            {player.id === 'P1' ? 'P1' : 'P2'}
        </span>
      </div>
      <div>
        <div className={`font-bold ${colorClass} text-lg tracking-wide`}>{isMe ? t.game_you : player.name}</div>
        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
          {player.stealsRemaining > 0 ? (
             <>
               <span className="text-yellow-500">★</span> 
               <span className="opacity-70">{t.game_ready}</span>
             </>
          ) : (
             <span className="opacity-30">{t.game_no_steal}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// --- App ---

export default function App() {
  const [appMode, setAppMode] = useState<'MENU' | 'LOBBY' | 'PRACTICE' | 'CHALLENGE' | 'GAME'>('MENU');
  
  // Persisted State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);

  // Game State
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const [myId, setMyId] = useState<PlayerId | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);

  // Challenge
  const [challengeStartTime, setChallengeStartTime] = useState<number>(0);
  const [challengeTime, setChallengeTime] = useState<string>("00:00");
  
  // Refs
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const roleRef = useRef<'HOST' | 'GUEST' | 'SOLO' | 'NONE'>('NONE');
  const [, setTick] = useState(0);

  // Helpers
  const t = TRANSLATIONS[settings.language];

  // --- Persistence ---
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('gridrush_settings');
      if (savedSettings) setSettings(JSON.parse(savedSettings));
      
      const savedStats = localStorage.getItem('gridrush_stats');
      if (savedStats) {
         const parsed = JSON.parse(savedStats);
         // Migration: Ensure practiceRecords exists if loading old save
         if (!parsed.practiceRecords) parsed.practiceRecords = [];
         setStats(parsed);
      }
    } catch (e) { console.error('Load failed', e); }
  }, []);

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

  const saveStats = (newStats: UserStats) => {
    setStats(newStats);
    localStorage.setItem('gridrush_stats', JSON.stringify(newStats));
    checkAchievements(newStats);
  };

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('gridrush_settings', JSON.stringify(newSettings));
  };

  const clearData = () => {
    localStorage.removeItem('gridrush_stats');
    localStorage.removeItem('gridrush_settings');
    setStats(DEFAULT_STATS);
    setSettings(DEFAULT_SETTINGS);
    window.location.reload();
  };

  const handlePracticeRecord = (record: PracticeRecord) => {
      const newStats = { ...stats, practiceRecords: [...stats.practiceRecords, record] };
      saveStats(newStats);
  };

  // --- Achievements Logic ---
  const checkAchievements = (currentStats: UserStats) => {
    let unlocked = [...currentStats.unlockedAchievements];
    let changed = false;

    ACHIEVEMENTS_LIST.forEach(ach => {
      if (!unlocked.includes(ach.id) && ach.condition(currentStats)) {
        unlocked.push(ach.id);
        setNewAchievement(ach.titleEn); // Show toast
        audio.playWin(); // Achievement sound
        changed = true;
        setTimeout(() => setNewAchievement(null), 4000);
      }
    });

    if (changed) {
      const updated = { ...currentStats, unlockedAchievements: unlocked };
      setStats(updated);
      localStorage.setItem('gridrush_stats', JSON.stringify(updated));
    }
  };

  // --- Game Loop ---
  useEffect(() => {
    if ((roleRef.current !== 'HOST' && roleRef.current !== 'SOLO') || gameState.status !== 'PLAYING') return;

    const interval = setInterval(() => {
      setTick(t => t + 1);

      // Solo Challenge Timer
      if (roleRef.current === 'SOLO') {
        const diff = Date.now() - challengeStartTime;
        const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setChallengeTime(`${mins}:${secs}`);
      }

      // Check Steal Expiry (Online Only)
      if (roleRef.current === 'HOST' && gameState.stealNotification) {
        if (Date.now() > gameState.stealNotification.expiresAt) {
          setGameState(prev => ({ ...prev, stealNotification: null }));
          syncState();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.status, gameState.stealNotification, challengeStartTime]);

  const syncState = (newState?: GameState) => {
    if (roleRef.current === 'HOST' && connRef.current) {
      const stateToSend = newState || gameState; 
      connRef.current.send({ type: 'STATE_UPDATE', state: stateToSend });
    }
  };

  useEffect(() => {
    if (roleRef.current === 'HOST' && gameState.status !== 'IDLE') {
      if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'STATE_UPDATE', state: gameState });
      }
    }
  }, [gameState]);

  // --- Game Logic ---

  const startNewGame = (mode: 'ONLINE' | 'SOLO') => {
    audio.playClick();
    let gameIds: string[];
    let numCells = 9;

    if (mode === 'SOLO') {
       // Solo: All games in inventory or a fixed large number
       gameIds = shuffleGames(MINI_GAMES.map(g => g.id));
       numCells = gameIds.length;
    } else {
       // Online: 9 random games
       gameIds = shuffleGames(MINI_GAMES.map(g => g.id)).slice(0, 9);
    }

    const cells: CellData[] = Array(numCells).fill(null).map((_, i) => ({
      id: i,
      gameId: gameIds[i],
      owner: null,
      activePlayers: [],
      lastInteraction: 0,
    }));

    const newGame: GameState = {
      status: 'PLAYING',
      cells,
      p1: INITIAL_PLAYER_STATE('P1', 'Player Blue'),
      p2: INITIAL_PLAYER_STATE('P2', 'Player Red'),
      winner: null,
      stealNotification: null,
    };
    
    if (mode === 'ONLINE') {
       setGameState(newGame);
       if (roleRef.current === 'HOST' && connRef.current) {
          connRef.current.send({ type: 'STATE_UPDATE', state: newGame });
       }
       saveStats({ ...stats, gamesPlayed: stats.gamesPlayed + 1 });
    } else {
       // Setup Solo State
       // In Solo, activeCell acts as the "Current Level Index"
       const soloGame = { ...newGame, p1: { ...newGame.p1, activeCell: 0 } };
       setGameState(soloGame);
       
       roleRef.current = 'SOLO';
       setMyId('P1');
       setChallengeStartTime(Date.now());
       setAppMode('GAME');
       saveStats({ ...stats, gamesPlayed: stats.gamesPlayed + 1 });
    }
  };

  const processCellClick = (pid: PlayerId, cellIndex: number) => {
    setGameState(prev => {
      // Solo mode click logic is handled by completion mainly, but this protects against invalid clicks
      if (roleRef.current === 'SOLO') return prev; 
      
      const cell = prev.cells[cellIndex];
      const player = pid === 'P1' ? prev.p1 : prev.p2;
      const opponent = pid === 'P1' ? prev.p2 : prev.p1;

      if (prev.winner) return prev;
      if (player.activeCell === cellIndex) return prev; 
      if (cell.owner === pid) return prev;

      if (cell.owner && cell.owner !== pid) {
        if (player.stealsRemaining <= 0) return prev;
        
        if (roleRef.current === 'HOST') {
          const isMe = pid === 'P1';
          if (isMe) saveStats({ ...stats, totalSteals: stats.totalSteals + 1 });
        }

        const pStateKey = pid === 'P1' ? 'p1' : 'p2';
        return {
          ...prev,
          [pStateKey]: { ...prev[pStateKey], activeCell: cellIndex, stealsRemaining: 0 },
          cells: prev.cells.map((c, i) => i === cellIndex ? { ...c, activePlayers: [...c.activePlayers, pid] } : c),
          stealNotification: {
            challengerId: pid,
            defenderId: opponent.id,
            cellId: cellIndex,
            timestamp: Date.now(),
            expiresAt: Date.now() + 5000
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
        [pKey]: { ...prev[pKey], activeCell: cellIndex }
      };
    });
  };

  const processDefend = (pid: PlayerId) => {
    if (roleRef.current === 'SOLO') return;
    setGameState(prev => {
      if (!prev.stealNotification || prev.stealNotification.defenderId !== pid) return prev;
      
      if (roleRef.current === 'HOST' && pid === 'P1') {
         saveStats({ ...stats, totalDefends: stats.totalDefends + 1 });
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
        [pKey]: { ...prev[pKey], activeCell: targetCell, isDefending: true },
        stealNotification: null
      };
    });
  };

  const processGameComplete = (pid: PlayerId, success: boolean) => {
    if (!success) return; 

    setGameState(prev => {
      // Solo Mode Logic
      if (roleRef.current === 'SOLO') {
        const currentLevel = prev.p1.activeCell;
        if (currentLevel === null) return prev;
        
        const nextLevel = currentLevel + 1;
        const finished = nextLevel >= prev.cells.length;

        if (finished) {
           const timeTaken = Date.now() - challengeStartTime;
           const newFastest = (stats.fastestSoloRun === 0 || timeTaken < stats.fastestSoloRun) ? timeTaken : stats.fastestSoloRun;
           saveStats({ ...stats, fastestSoloRun: newFastest });
           audio.playWin();
           
           return {
             ...prev,
             status: 'FINISHED',
             winner: 'P1',
             p1: { ...prev.p1, activeCell: null }
           };
        } else {
           // Move to next level
           return {
             ...prev,
             p1: { ...prev.p1, activeCell: nextLevel }
           };
        }
      }

      // Online Mode Logic
      const pState = pid === 'P1' ? prev.p1 : prev.p2;
      const cellIdx = pState.activeCell;
      if (cellIdx === null) return prev;

      const pKey = pid === 'P1' ? 'p1' : 'p2';
      const oppKey = pid === 'P1' ? 'p2' : 'p1';

      const newCells = prev.cells.map((c, i) => {
        if (i === cellIdx) {
          return { ...c, owner: pid, activePlayers: [], lastInteraction: Date.now() };
        }
        return c;
      });

      let newOppState = { ...prev[oppKey] };
      if (prev[oppKey].activeCell === cellIdx) {
        newOppState.activeCell = null;
        newOppState.isDefending = false; 
      }
      const winner = checkWinner(newCells);
      
      if (roleRef.current === 'HOST' && winner) {
          if (winner === 'P1') saveStats({ ...stats, onlineWins: stats.onlineWins + 1 });
      }

      if (winner) audio.playWin();

      return {
        ...prev,
        cells: newCells,
        status: winner ? 'FINISHED' : prev.status,
        winner,
        [pKey]: { ...prev[pKey], activeCell: null, isDefending: false },
        [oppKey]: newOppState,
        stealNotification: prev.stealNotification?.cellId === cellIdx ? null : prev.stealNotification
      };
    });
  };

  const sendAction = (action: GameAction) => {
    if (roleRef.current === 'HOST' || roleRef.current === 'SOLO') {
      if (action.type === 'CLICK_CELL') processCellClick('P1', action.cellIndex);
      if (action.type === 'DEFEND') processDefend('P1');
      if (action.type === 'COMPLETE_GAME') processGameComplete('P1', action.success);
    } else {
      if (connRef.current) connRef.current.send({ type: 'ACTION', action });
    }
  };

  const handleGuestMessage = (msg: NetworkMessage) => {
    if (msg.type === 'ACTION') {
      const { action } = msg;
      if (action.type === 'CLICK_CELL') processCellClick('P2', action.cellIndex);
      if (action.type === 'DEFEND') processDefend('P2');
      if (action.type === 'COMPLETE_GAME') processGameComplete('P2', action.success);
    }
  };

  // --- Network Setup ---
  const setupHost = () => {
    setIsConnecting(true);
    setError(null);
    const code = Math.floor(Math.random() * 9000 + 1000).toString();
    const peer = new window.Peer(`gridrush-${code}`);
    peerRef.current = peer;

    peer.on('open', () => {
      setRoomId(code);
      setMyId('P1');
      roleRef.current = 'HOST';
      setIsConnecting(false);
      setAppMode('GAME');
    });

    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      conn.on('data', (data: NetworkMessage) => handleGuestMessage(data));
      conn.on('open', () => startNewGame('ONLINE'));
    });

    peer.on('error', () => { setError("Conn Error"); setIsConnecting(false); });
  };

  const joinGame = (code: string) => {
    setIsConnecting(true);
    setError(null);
    const peer = new window.Peer(); 
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(`gridrush-${code}`);
      connRef.current = conn;
      roleRef.current = 'GUEST';
      setMyId('P2');
      conn.on('open', () => {
        setRoomId(code);
        setIsConnecting(false);
        setAppMode('GAME');
      });
      conn.on('data', (data: NetworkMessage) => {
        if (data.type === 'STATE_UPDATE') setGameState(data.state);
      });
      peer.on('error', () => { setError("Err"); setIsConnecting(false); });
    });
  };

  const resetGame = () => {
    if (peerRef.current) peerRef.current.destroy();
    setGameState(DEFAULT_GAME_STATE);
    setMyId(null);
    setRoomId(null);
    setIsConnecting(false);
    roleRef.current = 'NONE';
    setError(null);
    setAppMode('MENU');
    audio.playClick();
  };

  // --- Render ---

  if (appMode === 'MENU') {
    return (
      <div className="w-full h-full text-slate-900 dark:text-white transition-colors duration-300">
        {showRules && <RulesModal onClose={() => setShowRules(false)} t={t} />}
        {showSettings && <SettingsModal settings={settings} onUpdate={saveSettings} onClearData={clearData} onClose={() => setShowSettings(false)} t={t} />}
        {showAchievements && <AchievementsModal stats={stats} language={settings.language} onClose={() => setShowAchievements(false)} t={t} />}
        <MainMenu 
          onOnline={() => setAppMode('LOBBY')}
          onChallenge={() => startNewGame('SOLO')}
          onPractice={() => setAppMode('PRACTICE')}
          onShowRules={() => setShowRules(true)}
          onShowSettings={() => setShowSettings(true)}
          onShowAchievements={() => setShowAchievements(true)}
          t={t}
        />
      </div>
    );
  }

  if (appMode === 'PRACTICE') return <PracticeMode onBack={() => setAppMode('MENU')} t={t} language={settings.language} stats={stats} onSaveRecord={handlePracticeRecord} />;
  
  if (appMode === 'LOBBY') {
    return <OnlineLobby onCreate={setupHost} onJoin={joinGame} onBack={resetGame} isConnecting={isConnecting} error={error} t={t} />;
  }

  if (myId === 'P1' && roomId && gameState.status === 'IDLE') {
    return <WaitingRoom roomId={roomId} onCancel={resetGame} t={t} />;
  }

  // --- GAME VIEW ---
  const me = myId === 'P1' ? gameState.p1 : gameState.p2;
  const opponent = myId === 'P1' ? gameState.p2 : gameState.p1;
  const isSolo = roleRef.current === 'SOLO';
  const myActiveCellIdx = me.activeCell;
  
  // Logic distinction: 
  // In Online, we play if activeCell is set.
  // In Solo, we ALWAYS play until finished (activeCell is the level index).
  const isPlayingMiniGame = isSolo ? (myActiveCellIdx !== null) : (myActiveCellIdx !== null);
  const miniGameId = isPlayingMiniGame && myActiveCellIdx !== null ? gameState.cells[myActiveCellIdx].gameId : null;

  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {showRules && <RulesModal onClose={() => setShowRules(false)} t={t} />}

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
            <button onClick={resetGame} className="mt-8 px-8 py-3 bg-white text-black hover:bg-slate-200 rounded-full transition-colors font-bold uppercase tracking-widest shadow-lg">Back to Menu</button>
          </div>
        </div>
      )}

      {/* Steal Notification (Only Online) */}
      {gameState.stealNotification && !isSolo && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg pointer-events-none">
          {(() => {
            const { defenderId, expiresAt, cellId } = gameState.stealNotification!;
            const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            const isDefender = myId === defenderId;
            const bgClass = isDefender ? 'bg-red-500 shadow-red-500/50' : 'bg-blue-500 shadow-blue-500/50';
            const showDefendBtn = isDefender && me.activeCell !== cellId;

            return (
              <div className={`mx-4 p-5 rounded-2xl ${bgClass} shadow-xl text-white flex justify-between items-center animate-pulse-fast pointer-events-auto`}>
                <div>
                   <h3 className="font-bold uppercase text-lg tracking-wider">{isDefender ? t.msg_steal_attack : t.msg_steal_doing}</h3>
                   <div className="text-sm opacity-90">{isDefender ? `Opponent is stealing Cell ${cellId + 1}!` : `Stealing Cell ${cellId + 1} from opponent!`}</div>
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

      {/* HUD */}
      <div className="h-20 md:h-24 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-4 md:px-12 z-10 shrink-0 relative shadow-sm">
         <PlayerBadge player={me} isMe={true} t={t} />
         <div className="flex flex-col items-center">
            {isSolo ? (
                <div className="flex flex-col items-center gap-1">
                    <div className="text-3xl font-mono font-bold text-slate-800 dark:text-yellow-500">{challengeTime}</div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-[0.3em] uppercase">{t.level_progress} {myActiveCellIdx !== null ? myActiveCellIdx + 1 : '-'}/{gameState.cells.length}</div>
                </div>
            ) : (
                <>
                    <div className="text-3xl font-black italic text-slate-100 dark:text-slate-800 tracking-widest absolute center-x top-1/2 -translate-y-1/2 pointer-events-none">VS</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-8 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">ROOM: {roomId}</div>
                </>
            )}
         </div>
         {isSolo ? (
             <button 
                onClick={resetGame}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 border border-red-200 dark:border-red-800 text-xs font-bold uppercase tracking-wider transition-colors"
             >
                <Icons.Exit className="w-4 h-4" /> {t.exit_game}
             </button>
         ) : (
             <PlayerBadge player={opponent} isMe={false} opponent t={t} />
         )}
      </div>

      {/* Game Grid or Solo View */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
         <button onClick={() => { audio.playClick(); setShowRules(true); }} className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg hover:scale-105 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-white font-bold transition-all z-20">?</button>

         {isPlayingMiniGame && miniGameId ? (
            <div className="w-full max-w-lg aspect-square md:aspect-auto md:h-[600px] flex flex-col z-10">
               <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl relative flex flex-col items-center justify-center flex-1 animate-in zoom-in duration-300 border border-slate-200 dark:border-slate-800">
                  <div className="absolute top-6 left-6 text-xs font-mono text-slate-400 tracking-widest uppercase">
                      {isSolo ? `${t.level_progress} ${myActiveCellIdx! + 1}` : `${t.game_playing} ${myActiveCellIdx! + 1}`}
                  </div>
                  <h3 className="text-center text-3xl font-black mb-10 text-slate-900 dark:text-white uppercase tracking-widest drop-shadow-sm">{MINI_GAMES.find(g => g.id === miniGameId)?.name}</h3>
                  <div className="w-full flex-1">
                     <MiniGameRenderer 
                       type={miniGameId} 
                       playerId={myId!} 
                       onComplete={(success) => sendAction({ type: 'COMPLETE_GAME', success })} 
                       language={settings.language} 
                       difficulty="HARD" 
                     />
                  </div>
               </div>
            </div>
         ) : (
            // This grid view only renders for ONLINE mode when no minigame is active
            !isSolo && (
            <div className="grid grid-cols-3 gap-4 w-full max-w-md aspect-square z-10">
               {gameState.cells.map((cell) => {
                  const isOwnedByMe = cell.owner === myId;
                  const isOwnedByOpp = cell.owner && cell.owner !== myId;
                  const isOppActive = cell.activePlayers.includes(opponent.id);
                  
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

                  const canSteal = isOwnedByOpp && me.stealsRemaining > 0;
                  if (canSteal) baseClass += " hover:border-yellow-400 hover:shadow-yellow-400/50 cursor-crosshair hover:scale-105 z-10";

                  return (
                     <div key={cell.id} onClick={() => { audio.playClick(); sendAction({ type: 'CLICK_CELL', cellIndex: cell.id }); }} className={baseClass}>
                        {cell.owner === 'P1' && <Icons.Flag className="w-12 h-12 text-blue-500 drop-shadow-sm animate-fade-in" />}
                        {cell.owner === 'P2' && <Icons.Flag className="w-12 h-12 text-red-500 drop-shadow-sm animate-fade-in" />}
                        {!cell.owner && <Icons.Question className="w-8 h-8 text-slate-200 dark:text-slate-700 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />}
                        
                        {isOppActive && (
                           <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-600 px-2 py-1 rounded-full shadow-md z-20">
                              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              <span className="text-[10px] font-bold text-white uppercase tracking-wide">{t.game_enemy}</span>
                           </div>
                        )}
                        
                        {canSteal && (
                           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-sm z-30">
                              <Icons.Sword className="w-10 h-10 text-yellow-400 mb-2 animate-bounce" />
                              <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{t.game_steal}</span>
                           </div>
                        )}
                        
                        <div className="absolute bottom-3 left-4 text-[10px] text-slate-300 dark:text-slate-600 font-mono font-bold">{cell.id + 1}</div>
                     </div>
                  );
               })}
            </div>
            )
         )}
      </div>
    </div>
  );
}