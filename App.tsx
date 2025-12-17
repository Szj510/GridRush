import React, { useState, useEffect, useRef } from 'react';
import { GameState, PlayerId, PlayerState, CellData, StealNotification, NetworkMessage, GameAction, AppSettings, UserStats, Achievement } from './types';
import { MINI_GAMES, Icons, TRANSLATIONS, ACHIEVEMENTS_LIST } from './constants';
import { checkWinner, shuffleGames } from './services/gameLogic';
import { MiniGameRenderer } from './components/MiniGames';

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
  soundEnabled: true,
  musicEnabled: true,
};

const DEFAULT_STATS: UserStats = {
  onlineWins: 0,
  fastestSoloRun: 0,
  totalSteals: 0,
  totalDefends: 0,
  gamesPlayed: 0,
  unlockedAchievements: []
};

// --- Modals ---

const RulesModal = ({ onClose, t }: { onClose: () => void, t: any }) => (
  <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
    <div className="glass-panel rounded-2xl p-8 max-w-lg w-full relative animate-fade-in border border-white/10">
      <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">✕</button>
      <h2 className="text-2xl font-bold mb-6 text-center text-white tracking-widest uppercase">
        {t.rules_title}
      </h2>
      <div className="space-y-6 text-white/80 text-sm md:text-base leading-relaxed font-light">
        <p><strong className="text-white font-semibold">Goal:</strong> {t.rules_goal}</p>
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <strong className="block text-blue-400 mb-2 font-semibold">🏁 Racing</strong>
          {t.rules_race}
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <strong className="block text-red-400 mb-2 font-semibold">⚔️ Stealing</strong>
          {t.rules_steal}
        </div>
      </div>
      <button onClick={onClose} className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-all">
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
    <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl p-8 max-w-md w-full animate-fade-in">
        <h2 className="text-xl font-bold mb-8 text-white flex items-center gap-3 tracking-widest uppercase">
          <Icons.Settings className="w-5 h-5" /> {t.settings_title}
        </h2>

        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <span className="text-white/60 font-light">{t.settings_lang}</span>
            <div className="flex bg-black/20 rounded-lg p-1">
              <button 
                onClick={() => onUpdate({ ...settings, language: 'en' })}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.language === 'en' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >EN</button>
              <button 
                onClick={() => onUpdate({ ...settings, language: 'zh' })}
                className={`px-4 py-1.5 rounded text-sm transition-all ${settings.language === 'zh' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >中文</button>
            </div>
          </div>

          <div className="flex justify-between items-center">
             <span className="text-white/60 font-light">{t.settings_sound}</span>
             <button 
               onClick={() => onUpdate({ ...settings, soundEnabled: !settings.soundEnabled })}
               className={`w-12 h-6 rounded-full transition-colors relative ${settings.soundEnabled ? 'bg-emerald-500/80' : 'bg-white/10'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settings.soundEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

           <div className="flex justify-between items-center">
             <span className="text-white/60 font-light">{t.settings_music}</span>
             <button 
               onClick={() => onUpdate({ ...settings, musicEnabled: !settings.musicEnabled })}
               className={`w-12 h-6 rounded-full transition-colors relative ${settings.musicEnabled ? 'bg-emerald-500/80' : 'bg-white/10'}`}
             >
               <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settings.musicEnabled ? 'left-7' : 'left-1'}`} />
             </button>
          </div>

          <div className="pt-6 border-t border-white/5">
             <div className="flex justify-between items-center">
               <div>
                  <div className="text-red-400 font-medium text-sm">{t.settings_data}</div>
               </div>
               <button 
                 onClick={onClearData}
                 className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg text-xs tracking-wider uppercase transition-colors"
               >
                 {t.settings_reset}
               </button>
             </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-8 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-medium transition-colors">
          {t.settings_close}
        </button>
      </div>
    </div>
  );
};

const AchievementsModal = ({ stats, language, onClose, t }: { stats: UserStats, language: string, onClose: () => void, t: any }) => (
  <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
    <div className="glass-panel rounded-2xl max-w-2xl w-full flex flex-col max-h-[80vh] animate-fade-in border border-white/10">
      <div className="p-6 border-b border-white/10 flex justify-between items-center">
        <h2 className="text-xl font-bold text-yellow-400/90 flex items-center gap-2 uppercase tracking-widest">
          <Icons.Trophy className="w-5 h-5" /> {t.ach_title}
        </h2>
        <button onClick={onClose} className="text-2xl text-white/50 hover:text-white transition-colors">✕</button>
      </div>
      
      <div className="overflow-y-auto p-6 space-y-3 custom-scrollbar">
        {ACHIEVEMENTS_LIST.map(ach => {
          const unlocked = stats.unlockedAchievements.includes(ach.id);
          const title = language === 'zh' ? ach.titleZh : ach.titleEn;
          const desc = language === 'zh' ? ach.descZh : ach.descEn;

          return (
            <div key={ach.id} className={`p-4 rounded-xl border transition-all ${unlocked ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-white/5 border-transparent opacity-50'} flex items-center gap-4`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${unlocked ? 'bg-yellow-500/20 text-yellow-400' : 'bg-black/20 text-white/20'}`}>
                {ach.icon}
              </div>
              <div className="flex-1">
                <h3 className={`font-bold text-base ${unlocked ? 'text-white' : 'text-white/50'}`}>{title}</h3>
                <p className="text-xs text-white/40 mt-1">{desc}</p>
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
        onClick={onShowAchievements}
        className="w-10 h-10 rounded-full glass-panel hover:bg-white/10 flex items-center justify-center text-yellow-400 transition-all"
      >
        <Icons.Trophy className="w-4 h-4" />
      </button>
      <button 
        onClick={onShowSettings}
        className="w-10 h-10 rounded-full glass-panel hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
      >
        <Icons.Settings className="w-4 h-4" />
      </button>
      <button 
        onClick={onShowRules}
        className="w-10 h-10 rounded-full glass-panel hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white font-bold transition-all"
      >
        ?
      </button>
    </div>

    <div className="mb-16 text-center relative">
      <div className="absolute -inset-10 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />
      <h1 className="text-6xl md:text-8xl font-black mb-4 text-white tracking-tighter drop-shadow-2xl relative z-10">
        GRID<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">RUSH</span>
      </h1>
      <p className="text-white/40 font-mono text-sm md:text-base tracking-[0.3em] uppercase">{t.menu_subtitle}</p>
    </div>

    <div className="flex flex-col gap-4 w-full max-w-sm relative z-10">
      <button onClick={onOnline} className="group w-full py-5 premium-btn rounded-2xl flex items-center justify-center gap-4 text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all">
        <Icons.Sword className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_online}</span>
      </button>

      <button onClick={onChallenge} className="group w-full py-5 premium-btn rounded-2xl flex items-center justify-center gap-4 text-white hover:border-yellow-500/50 hover:bg-yellow-500/10 transition-all">
        <Icons.Clock className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_solo}</span>
      </button>

      <button onClick={onPractice} className="group w-full py-5 premium-btn rounded-2xl flex items-center justify-center gap-4 text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all">
        <Icons.Dumbbell className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_practice}</span>
      </button>

      <button onClick={onShowAchievements} className="md:hidden w-full py-5 premium-btn rounded-2xl flex items-center justify-center gap-4 text-white">
        <Icons.Trophy className="w-5 h-5 text-yellow-400" /> 
        <span className="font-bold tracking-widest text-lg">{t.menu_achievements}</span>
      </button>
    </div>
  </div>
);

// --- Practice Mode ---

const PracticeMode = ({ onBack, t, language }: { onBack: () => void, t: any, language: any }) => {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const handleComplete = (success: boolean) => {
    if (success) {
       setTimeout(() => {
          setActiveGame(null);
       }, 800);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-black">
       {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-black pointer-events-none" />

      <div className="p-6 flex items-center gap-4 z-10">
        <button onClick={onBack} className="text-white/50 hover:text-white transition-colors flex items-center gap-2 text-sm font-mono uppercase tracking-widest">
           ← Back
        </button>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full overflow-y-auto custom-scrollbar z-10">
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 mb-8 uppercase tracking-tighter">
           {t.menu_practice}
        </h2>

        {activeGame ? (
           <div className="flex flex-col items-center animate-fade-in h-[600px]">
             <div className="flex justify-between w-full max-w-md mb-6 items-center">
               <h3 className="text-xl font-bold text-white uppercase tracking-widest">{MINI_GAMES.find(g => g.id === activeGame)?.name}</h3>
               <button onClick={() => setActiveGame(null)} className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wider">Close</button>
             </div>
             <div className="glass-panel p-8 rounded-3xl w-full max-w-md h-full shadow-2xl border border-white/10">
                <MiniGameRenderer type={activeGame} playerId="P1" onComplete={handleComplete} language={language} />
             </div>
           </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-12">
            {MINI_GAMES.map(game => (
              <button 
                key={game.id}
                onClick={() => setActiveGame(game.id)}
                className="premium-btn p-8 rounded-2xl flex flex-col items-center gap-4 group"
              >
                <div className="text-4xl group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">{game.icon}</div>
                <div className="font-bold text-white group-hover:text-emerald-300 transition-colors uppercase tracking-wide text-sm">{game.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Online Lobby ---

const OnlineLobby = ({ onCreate, onJoin, onBack, isConnecting, error, t }: any) => {
  const [joinId, setJoinId] = useState('');

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
      <button onClick={onBack} className="absolute top-6 left-6 text-white/40 hover:text-white transition-colors uppercase tracking-widest text-xs">← Back</button>
      
      <h2 className="text-4xl font-black mb-12 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 uppercase tracking-tighter">{t.menu_online}</h2>
      
      {isConnecting ? (
        <div className="flex flex-col items-center animate-fade-in">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mb-6"></div>
          <p className="text-white/60 font-mono text-sm tracking-widest animate-pulse">{t.online_connecting}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-2xl items-stretch animate-fade-in">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 glass-panel p-8 rounded-2xl flex flex-col items-center hover:border-blue-500/50 transition-colors group">
              <h3 className="text-lg font-bold mb-2 text-blue-400 uppercase tracking-widest group-hover:text-blue-300 transition-colors">{t.online_host}</h3>
              <p className="text-xs text-white/40 text-center mb-8 h-8">{t.online_host_desc}</p>
              <button onClick={onCreate} className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-blue-900/50 transition-all active:scale-95">{t.online_create}</button>
            </div>
            
            <div className="flex-1 glass-panel p-8 rounded-2xl flex flex-col items-center hover:border-red-500/50 transition-colors group">
              <h3 className="text-lg font-bold mb-2 text-red-400 uppercase tracking-widest group-hover:text-red-300 transition-colors">{t.online_join}</h3>
              <p className="text-xs text-white/40 text-center mb-8 h-8">{t.online_join_desc}</p>
              <div className="flex w-full gap-2">
                <input 
                  value={joinId} 
                  onChange={(e) => setJoinId(e.target.value.toUpperCase().slice(0, 4))} 
                  placeholder="CODE" 
                  className="flex-1 bg-black/40 border border-white/10 focus:border-white/30 rounded-xl px-4 text-center font-mono text-xl focus:outline-none uppercase text-white placeholder-white/20 transition-colors" 
                />
                <button onClick={() => onJoin(joinId)} disabled={joinId.length !== 4} className="px-6 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg shadow-red-900/50 transition-all active:scale-95">{t.online_join_btn}</button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-white/20 mt-8 text-center max-w-md mx-auto">{t.online_instruction}</p>
        </div>
      )}
      {error && <div className="mt-8 bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-3 rounded-lg text-sm">{error}</div>}
    </div>
  );
};

const WaitingRoom = ({ roomId, onCancel, t }: { roomId: string, onCancel: () => void, t: any }) => (
  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6">
    <div className="glass-panel p-10 rounded-3xl flex flex-col items-center max-w-md w-full animate-fade-in">
      <h2 className="text-white/40 mb-4 text-xs font-mono uppercase tracking-widest">Room Code</h2>
      <div className="text-6xl font-mono font-bold tracking-widest text-white mb-10 select-all cursor-pointer bg-black/30 px-8 py-6 rounded-2xl border border-white/5 hover:border-white/20 transition-colors">{roomId}</div>
      <div className="flex items-center gap-3 mb-10">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-blue-300 text-sm font-medium tracking-wide">{t.online_waiting}</span>
      </div>
      <button onClick={onCancel} className="text-white/30 hover:text-white text-xs uppercase tracking-widest transition-colors">Cancel</button>
    </div>
  </div>
);

const PlayerBadge = ({ player, isMe, opponent, t }: { player: PlayerState, isMe: boolean, opponent?: boolean, t: any }) => {
  const colorClass = player.id === 'P1' ? 'text-blue-400' : 'text-red-400';
  const borderClass = player.id === 'P1' ? 'border-blue-500/50 bg-blue-500/10' : 'border-red-500/50 bg-red-500/10';
  
  return (
    <div className={`flex items-center gap-4 ${opponent ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`w-14 h-14 rounded-2xl border ${borderClass} flex items-center justify-center text-xl font-bold shadow-lg backdrop-blur-sm`}>
        {player.id === 'P1' ? 'P1' : 'P2'}
      </div>
      <div>
        <div className={`font-bold ${colorClass} text-lg tracking-wide`}>{isMe ? t.game_you : player.name}</div>
        <div className="text-xs text-white/40 flex items-center gap-1.5 mt-1">
          {player.stealsRemaining > 0 ? (
             <>
               <span className="text-yellow-400">★</span> 
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
      if (savedStats) setStats(JSON.parse(savedStats));
    } catch (e) { console.error('Load failed', e); }
  }, []);

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

  // --- Achievements Logic ---
  const checkAchievements = (currentStats: UserStats) => {
    let unlocked = [...currentStats.unlockedAchievements];
    let changed = false;

    ACHIEVEMENTS_LIST.forEach(ach => {
      if (!unlocked.includes(ach.id) && ach.condition(currentStats)) {
        unlocked.push(ach.id);
        setNewAchievement(ach.titleEn); // Show toast
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
  };

  // --- Render ---

  if (appMode === 'MENU') {
    return (
      <>
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
      </>
    );
  }

  if (appMode === 'PRACTICE') return <PracticeMode onBack={() => setAppMode('MENU')} t={t} language={settings.language} />;
  
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
    <div className="h-screen w-screen flex flex-col relative overflow-hidden">
      
      {showRules && <RulesModal onClose={() => setShowRules(false)} t={t} />}

      {/* Achievement Toast */}
      {newAchievement && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 fade-in duration-300">
           <div className="bg-yellow-500 text-black px-6 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(234,179,8,0.5)] flex items-center gap-2 border border-yellow-400">
             <Icons.Trophy className="w-5 h-5" />
             <span>Unlocked: {newAchievement}</span>
           </div>
        </div>
      )}

      {/* Winner Overlay */}
      {gameState.winner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="text-center animate-bounce">
            <h2 className="text-5xl md:text-7xl font-black mb-4 text-white">
              {isSolo ? t.msg_challenge_complete : (gameState.winner === 'DRAW' ? t.msg_draw : (gameState.winner === myId ? t.msg_win : t.msg_lose))}
            </h2>
            {isSolo && <div className="text-3xl font-mono text-yellow-400 mb-6">TIME: {challengeTime}</div>}
            <button onClick={resetGame} className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition-colors text-white font-bold uppercase tracking-widest">Back to Menu</button>
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
            const bgClass = isDefender ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.5)]' : 'bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.5)]';
            const showDefendBtn = isDefender && me.activeCell !== cellId;

            return (
              <div className={`mx-4 p-5 rounded-2xl border border-white/20 ${bgClass} text-white flex justify-between items-center animate-pulse-fast pointer-events-auto`}>
                <div>
                   <h3 className="font-bold uppercase text-lg tracking-wider">{isDefender ? t.msg_steal_attack : t.msg_steal_doing}</h3>
                   <div className="text-sm opacity-90">{isDefender ? `Opponent is stealing Cell ${cellId + 1}!` : `Stealing Cell ${cellId + 1} from opponent!`}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-mono font-black">{remaining}s</span>
                  {showDefendBtn && (
                    <button onClick={() => sendAction({ type: 'DEFEND' })} className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:scale-105 active:scale-95 transition-transform shadow-lg">{t.msg_defend}</button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* HUD */}
      <div className="h-20 md:h-24 glass-panel border-b border-white/10 flex justify-between items-center px-4 md:px-12 z-10 shrink-0 relative">
         <PlayerBadge player={me} isMe={true} t={t} />
         <div className="flex flex-col items-center">
            {isSolo ? (
                <div className="flex flex-col items-center gap-1">
                    <div className="text-3xl font-mono font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">{challengeTime}</div>
                    <div className="text-[10px] text-white/50 font-mono tracking-[0.3em] uppercase">{t.level_progress} {myActiveCellIdx !== null ? myActiveCellIdx + 1 : '-'}/{gameState.cells.length}</div>
                </div>
            ) : (
                <>
                    <div className="text-3xl font-black italic text-white/5 tracking-widest absolute center-x top-1/2 -translate-y-1/2 pointer-events-none">VS</div>
                    <div className="text-[10px] text-white/30 font-mono mt-8 bg-black/20 px-2 py-1 rounded">ROOM: {roomId}</div>
                </>
            )}
         </div>
         {isSolo ? (
             <button 
                onClick={resetGame}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold uppercase tracking-wider transition-colors"
             >
                <Icons.Exit className="w-4 h-4" /> {t.exit_game}
             </button>
         ) : (
             <PlayerBadge player={opponent} isMe={false} opponent t={t} />
         )}
      </div>

      {/* Game Grid or Solo View */}
      <div className="flex-1 flex items-center justify-center p-4 relative bg-radial-gradient">
         <button onClick={() => setShowRules(true)} className="absolute bottom-6 right-6 w-10 h-10 rounded-full glass-panel hover:bg-white/10 flex items-center justify-center text-white/70 font-bold transition-all z-20">?</button>

         {isPlayingMiniGame && miniGameId ? (
            <div className="w-full max-w-lg aspect-square md:aspect-auto md:h-[600px] flex flex-col z-10">
               <div className="glass-panel p-8 rounded-3xl shadow-2xl relative flex flex-col items-center justify-center flex-1 animate-in zoom-in duration-300 border border-white/10">
                  <div className="absolute top-6 left-6 text-xs font-mono text-white/30 tracking-widest uppercase">
                      {isSolo ? `${t.level_progress} ${myActiveCellIdx! + 1}` : `${t.game_playing} ${myActiveCellIdx! + 1}`}
                  </div>
                  <h3 className="text-center text-3xl font-black mb-10 text-white uppercase tracking-widest drop-shadow-md">{MINI_GAMES.find(g => g.id === miniGameId)?.name}</h3>
                  <div className="w-full flex-1">
                     <MiniGameRenderer type={miniGameId} playerId={myId!} onComplete={(success) => sendAction({ type: 'COMPLETE_GAME', success })} language={settings.language} />
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
                  
                  let baseClass = "glass-panel rounded-2xl flex items-center justify-center relative transition-all duration-300 shadow-xl group border-2";
                  
                  if (isOwnedByMe) {
                      baseClass += myId === 'P1' 
                        ? " bg-blue-500/20 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.2)]" 
                        : " bg-red-500/20 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]";
                  } else if (isOwnedByOpp) {
                      baseClass += " bg-gray-900/80 border-gray-800 opacity-60 grayscale-[0.5]";
                  } else {
                      baseClass += " border-white/5 hover:border-white/20 hover:bg-white/5 cursor-pointer active:scale-95";
                  }

                  const canSteal = isOwnedByOpp && me.stealsRemaining > 0;
                  if (canSteal) baseClass += " hover:border-yellow-400 hover:shadow-[0_0_30px_rgba(250,204,21,0.3)] cursor-crosshair hover:scale-105 z-10";

                  return (
                     <div key={cell.id} onClick={() => sendAction({ type: 'CLICK_CELL', cellIndex: cell.id })} className={baseClass}>
                        {cell.owner === 'P1' && <Icons.Flag className="w-12 h-12 text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-fade-in" />}
                        {cell.owner === 'P2' && <Icons.Flag className="w-12 h-12 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-fade-in" />}
                        {!cell.owner && <Icons.Question className="w-8 h-8 text-white/10 group-hover:text-white/40 transition-colors" />}
                        
                        {isOppActive && (
                           <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/80 px-2 py-1 rounded-full backdrop-blur-md border border-red-500/30 shadow-lg">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span className="text-[10px] font-bold text-red-200 uppercase tracking-wide">{t.game_enemy}</span>
                           </div>
                        )}
                        
                        {canSteal && (
                           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl backdrop-blur-sm">
                              <Icons.Sword className="w-10 h-10 text-yellow-400 mb-2 animate-bounce" />
                              <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">{t.game_steal}</span>
                           </div>
                        )}
                        
                        <div className="absolute bottom-3 left-4 text-[10px] text-white/20 font-mono font-bold">{cell.id + 1}</div>
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