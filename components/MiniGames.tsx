import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Language, Difficulty } from '../types';
import { MINI_GAME_TRANSLATIONS, Icons } from '../constants';
import { audio } from '../services/audio';

interface Props {
  type: string;
  onComplete: (success: boolean, score?: number) => void;
  onInteraction?: () => void; // New prop to signal activity
  playerId: 'P1' | 'P2';
  language: Language;
  difficulty?: Difficulty; 
  tutorialEnabled?: boolean; 
}

const Button = ({ onClick, children, className, style, disabled, onInteraction }: any) => (
  <button 
    onClick={(e) => { 
      e.stopPropagation(); 
      if (!disabled) { 
        audio.playClick();
        onInteraction && onInteraction(); // Signal activity
        onClick && onClick(); 
      }
    }}
    disabled={disabled}
    className={`px-6 py-3 rounded-xl font-bold text-lg active:scale-95 transition-transform select-none shadow-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    style={style}
  >
    {children}
  </button>
);

// Helper for feedback
const useFeedback = () => {
  const [feedback, setFeedback] = useState<'NONE' | 'CORRECT' | 'WRONG'>('NONE');
  
  const trigger = (isCorrect: boolean) => {
    setFeedback(isCorrect ? 'CORRECT' : 'WRONG');
    if (isCorrect) audio.playSuccess();
    else audio.playFailure();
    setTimeout(() => setFeedback('NONE'), 300);
  };
  
  const bgClass = feedback === 'CORRECT' ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500' : feedback === 'WRONG' ? 'bg-red-100 dark:bg-red-900/30 ring-2 ring-red-500 animate-shake' : '';
  
  return { trigger, bgClass, feedback };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 1. Math Rush
const MathGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [problem, setProblem] = useState({ q: '...', a: 0, options: [] as number[] });
  const [score, setScore] = useState(0);
  const { trigger, bgClass } = useFeedback();
  const t = MINI_GAME_TRANSLATIONS[language];

  // Config based on difficulty
  const config = {
    EASY: { target: 2, maxNum: 10, ops: ['+'] },
    NORMAL: { target: 3, maxNum: 50, ops: ['+', '-'] },
    HARD: { target: 5, maxNum: 99, ops: ['+', '-'] },
    EXPERT: { target: 7, maxNum: 150, ops: ['+', '-', '*'] }
  }[difficulty];
  
  const generateProblem = () => {
    const op = config.ops[Math.floor(Math.random() * config.ops.length)];
    let a, b, ans;
    
    if (op === '*') {
       a = Math.floor(Math.random() * 10) + 2;
       b = Math.floor(Math.random() * 10) + 2;
       ans = a * b;
    } else if (op === '+') {
       a = Math.floor(Math.random() * config.maxNum) + 5;
       b = Math.floor(Math.random() * config.maxNum) + 5;
       ans = a + b;
    } else {
       a = Math.floor(Math.random() * config.maxNum) + 10;
       b = Math.floor(Math.random() * 10) + 1;
       ans = a - b;
    }
    
    const opts = new Set<number>();
    opts.add(ans);
    while(opts.size < 4) {
       const diff = Math.floor(Math.random() * 10) + 1;
       const dir = Math.random() > 0.5 ? 1 : -1;
       const val = ans + (diff * dir);
       if (val >= 0) opts.add(val);
    }
    setProblem({ q: `${a} ${op} ${b} = ?`, a: ans, options: Array.from(opts).sort(() => Math.random() - 0.5) });
  };

  useEffect(() => { generateProblem(); }, []);

  const handleAnswer = (val: number) => {
    const isCorrect = val === problem.a;
    trigger(isCorrect);
    
    if (isCorrect) {
      const newScore = score + 1;
      setScore(newScore);
      if (newScore >= config.target) {
        setTimeout(() => onComplete(true), 200);
      } else {
        generateProblem();
      }
    }
  };

  return (
    <div className={`flex flex-col items-center gap-6 w-full h-full justify-center rounded-3xl transition-colors duration-200 ${bgClass}`}>
      <div className="flex justify-between w-full max-w-xs text-sm text-slate-500 dark:text-slate-400 font-mono">
         <span>{t.score}: {score}/{config.target}</span>
         <span className="text-[10px] uppercase bg-slate-200 dark:bg-slate-700 px-2 rounded">{difficulty}</span>
      </div>
      <div className="text-5xl font-black mb-4 tracking-wider text-slate-900 dark:text-white drop-shadow-sm min-h-[3.5rem] flex items-center justify-center">
          {problem.q}
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        {problem.options.map((opt, i) => (
          <Button 
            key={i} 
            onClick={() => handleAnswer(opt)}
            onInteraction={onInteraction}
            className={`bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-6 text-2xl border border-slate-200 dark:border-slate-600 ${tutorialEnabled && opt === problem.a ? 'ring-4 ring-green-400 ring-opacity-50 animate-pulse' : ''}`}
          >
            {opt}
          </Button>
        ))}
      </div>
      {tutorialEnabled && <div className="text-xs text-green-600 dark:text-green-400 font-bold animate-bounce">HINT: Correct answer highlighted</div>}
    </div>
  );
};

// 2. Power Mash
const MashGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [progress, setProgress] = useState(30);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  // Difficulty adjustments
  const config = {
    EASY: { decay: 0.8, gain: 10 },
    NORMAL: { decay: 1.2, gain: 8 },
    HARD: { decay: 1.5, gain: 7 },
    EXPERT: { decay: 2.0, gain: 7 } 
  }[difficulty];

  const mash = () => {
    audio.playPop(); 
    setProgress(p => Math.min(100, p + config.gain));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
           clearInterval(timer);
           audio.playSuccess();
           onComplete(true);
           return 100;
        }
        if (p <= 0) return 0;
        return Math.max(0, p - config.decay);
      });
    }, 50);
    return () => clearInterval(timer);
  }, [onComplete, config.decay]);

  return (
    <div className={`flex flex-col items-center w-full gap-6 h-full justify-center rounded-3xl ${bgClass}`}>
      <div className="text-xl font-bold animate-pulse text-yellow-500">{t.mash_instr}</div>
      <div className="w-full max-w-xs h-8 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-300 dark:border-slate-600 relative">
        <div 
           className="h-full transition-all duration-75 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
           style={{ width: `${progress}%` }}
        />
        {tutorialEnabled && (
            <div className="absolute top-0 bottom-0 right-10 border-l-2 border-red-500 border-dashed opacity-50 text-[10px] pl-1 pt-1 text-red-500">GOAL</div>
        )}
      </div>
      <Button 
        onClick={mash}
        onInteraction={onInteraction}
        className="w-40 h-40 rounded-full bg-red-500 border-b-8 border-red-700 active:border-b-0 active:translate-y-2 text-white text-2xl flex items-center justify-center hover:bg-red-400 relative overflow-hidden"
      >
        <span className="relative z-10">MASH!</span>
        {tutorialEnabled && <div className="absolute inset-0 bg-white opacity-20 animate-ping rounded-full" />}
      </Button>
    </div>
  );
};

// 3. Stroop Test
const StroopGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const colors = [
    { name: language === 'zh' ? '红' : 'RED', hex: '#ef4444', id: 'red' },
    { name: language === 'zh' ? '蓝' : 'BLUE', hex: '#3b82f6', id: 'blue' },
    { name: language === 'zh' ? '绿' : 'GREEN', hex: '#22c55e', id: 'green' },
    { name: language === 'zh' ? '黄' : 'YELLOW', hex: '#eab308', id: 'yellow' },
  ];
  
  const [current, setCurrent] = useState({ text: colors[0], color: colors[1] });
  const [score, setScore] = useState(0);
  const { trigger, bgClass } = useFeedback();
  const t = MINI_GAME_TRANSLATIONS[language];

  const target = {
    EASY: 3,
    NORMAL: 5,
    HARD: 8,
    EXPERT: 12
  }[difficulty];

  const nextRound = () => {
     const textIdx = Math.floor(Math.random() * colors.length);
     let colorIdx = Math.floor(Math.random() * colors.length);
     while(colorIdx === textIdx) colorIdx = Math.floor(Math.random() * colors.length);
     setCurrent({ text: colors[textIdx], color: colors[colorIdx] });
  };

  useEffect(() => nextRound(), []);

  const handleAnswer = (id: string) => {
    const isCorrect = id === current.color.id;
    trigger(isCorrect);
    
    if (isCorrect) {
       const nextScore = score + 1;
       setScore(nextScore);
       if (nextScore >= target) setTimeout(() => onComplete(true), 200);
       else nextRound();
    } else {
       if (difficulty !== 'EASY') setScore(0);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-8 w-full h-full justify-center rounded-3xl transition-colors ${bgClass}`}>
      <div className="flex flex-col items-center">
        <div className="text-xl text-slate-500 dark:text-slate-400 mb-2">{t.stroop_instr}</div>
        <div className="text-sm font-mono text-slate-400">{t.score}: {score}/{target}</div>
      </div>
      <div className="relative flex flex-col items-center">
          <div 
            className="text-7xl font-black tracking-widest drop-shadow-sm h-24 relative z-10"
            style={{ color: current.color.hex }}
          >
            {current.text.name}
          </div>
          {tutorialEnabled && (
                <div className="mt-2 text-xs bg-slate-800 text-white px-3 py-1 rounded-full animate-bounce z-20">
                    Match this color!
                </div>
          )}
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
         {colors.map(c => (
           <Button 
             key={c.id} 
             onClick={() => handleAnswer(c.id)}
             onInteraction={onInteraction}
             className={`h-20 border-2 border-transparent hover:border-slate-300 dark:hover:border-white/20 shadow-none relative overflow-hidden`}
             style={{ backgroundColor: c.hex }}
           >
              {tutorialEnabled && c.id === current.color.id && (
                  <div className="absolute inset-0 bg-white/30 animate-pulse" />
              )}
           </Button>
         ))}
      </div>
    </div>
  );
};

// 4. Reaction
const ReactionGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [status, setStatus] = useState<'WAIT' | 'GO' | 'EARLY' | 'SLOW' | 'RESULT'>('WAIT');
  const [resultMs, setResultMs] = useState(0);
  const timeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const t = MINI_GAME_TRANSLATIONS[language];
  
  const threshold = {
    EASY: 500,
    NORMAL: 350,
    HARD: 280,
    EXPERT: 220
  }[difficulty];

  const start = () => {
    setStatus('WAIT');
    const delay = 1500 + Math.random() * 2500; 
    timeoutRef.current = window.setTimeout(() => {
      setStatus('GO');
      audio.playTone(600, 'square', 0.1); 
      startTimeRef.current = Date.now();
    }, delay);
  };

  useEffect(() => {
    start();
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const handleClick = () => {
    if (onInteraction) onInteraction();
    
    if (status === 'WAIT') {
      setStatus('EARLY');
      audio.playFailure();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else if (status === 'GO') {
      const diff = Date.now() - startTimeRef.current;
      setResultMs(diff);
      if (diff <= threshold) {
         setStatus('RESULT');
         audio.playSuccess();
         setTimeout(() => onComplete(true, diff), 800);
      } else {
         setStatus('SLOW');
         audio.playFailure();
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
        <div className="text-xs text-slate-400 uppercase font-mono mb-2">Target: &lt;{threshold}ms</div>
        <div 
        onMouseDown={handleClick} 
        className={`w-full max-w-sm aspect-square rounded-3xl flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-100 shadow-xl relative
            ${status === 'WAIT' ? 'bg-red-500' : 
            status === 'GO' ? 'bg-green-500 scale-[1.02]' : 
            status === 'RESULT' ? 'bg-blue-500' :
            'bg-orange-500'}
        `}
        >
        <span className="text-4xl font-bold tracking-widest text-white drop-shadow-md text-center px-4">
            {status === 'WAIT' ? t.wait : 
            status === 'GO' ? t.click : 
            status === 'RESULT' ? `${resultMs}ms!` :
            status === 'EARLY' ? t.too_early :
            `${t.too_slow}\n(${resultMs}ms)`}
        </span>
        {tutorialEnabled && status === 'WAIT' && (
            <div className="absolute bottom-4 text-white/70 text-sm animate-pulse">Wait for Green...</div>
        )}
        </div>
        {(status === 'EARLY' || status === 'SLOW') && (
            <Button onClick={start} onInteraction={onInteraction} className="bg-slate-700 text-white">{t.retry}</Button>
        )}
    </div>
  );
};

// 5. Memory Matrix
const MatrixGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [pattern, setPattern] = useState<number[]>([]);
  const [input, setInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<'WATCH' | 'INPUT'>('WATCH');
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  
  // Track which cell is currently lit
  const [currentLitCell, setCurrentLitCell] = useState<number | null>(null);
  
  // Use a ref to prevent double-initialization and ensure clean start
  const hasStartedRef = useRef(false);
  
  const t = MINI_GAME_TRANSLATIONS[language];

  // useMemo keeps the same object reference between renders so useCallback
  // and useEffect don't fire spuriously on every re-render.
  const config = React.useMemo(() => ({
    EASY:   { count: 3, flashTime: 1000, gapTime: 250 },
    NORMAL: { count: 5, flashTime: 800,  gapTime: 250 },
    HARD:   { count: 6, flashTime: 600,  gapTime: 250 },
    EXPERT: { count: 7, flashTime: 400,  gapTime: 250 },
  })[difficulty], [difficulty]);

  const startSequence = useCallback(async () => {
    hasStartedRef.current = true;
    
    // Ensure everything is reset visually
    setPhase('WATCH');
    setCurrentLitCell(null);
    setInput([]);
    setWrongIdx(null);
    
    // Generate unique pattern
    const p = new Set<number>();
    while(p.size < config.count) p.add(Math.floor(Math.random() * 9));
    const newPattern = Array.from(p); 
    setPattern(newPattern);

    // Initial pause before starting light show
    await sleep(800);

    // Play Sequence
    for (const cellId of newPattern) {
        // Light up
        setCurrentLitCell(cellId);
        audio.playClick();
        await sleep(config.flashTime);
        
        // Turn off
        setCurrentLitCell(null);
        await sleep(config.gapTime);
    }

    // Finished
    setPhase('INPUT');
    audio.playTone(400, 'sine', 0.1); 
  }, [config]);

  useEffect(() => { 
      // Only start if we haven't already
      if (!hasStartedRef.current) {
          startSequence(); 
      }
  }, [startSequence]);

  const handleClick = (i: number) => {
    if (phase === 'WATCH') return;
    if (input.includes(i)) return;

    if (onInteraction) onInteraction();
    audio.playClick();

    if (i === pattern[input.length]) {
      // Correct – next in sequence
      const next = [...input, i];
      setInput(next);
      if (next.length === pattern.length) {
        audio.playSuccess();
        setTimeout(() => onComplete(true), 300);
      }
    } else {
      setWrongIdx(i);
      audio.playFailure();
      hasStartedRef.current = false;
      setTimeout(() => startSequence(), 800);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <div className="text-xl font-bold text-blue-500 dark:text-blue-400">{phase === 'WATCH' ? t.repeat : t.repeat_go}</div>
        {phase === 'INPUT' && <div className="text-xs font-mono text-yellow-500 tracking-wider uppercase">{t.matrix_order}</div>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array(9).fill(0).map((_, i) => {
           const isSelected = input.includes(i);
           const isWrong = wrongIdx === i;
           const isLit = phase === 'WATCH' && currentLitCell === i;
           const isNext = phase === 'INPUT' && i === pattern[input.length];
           const showHint = tutorialEnabled && isNext;

           let bg = 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700';
           if (isLit) bg = 'bg-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.8)] border-yellow-500 scale-105 transition-none';
           if (phase === 'INPUT' && isSelected) bg = 'bg-green-500 shadow-[0_0_10px_#22c55e]';
           if (isWrong) bg = 'bg-red-500 animate-shake';
           if (showHint) bg += ' ring-2 ring-blue-400 animate-pulse';

           return (
             <button
               key={i}
               onClick={(e) => { e.stopPropagation(); handleClick(i); }}
               className={`w-20 h-20 rounded-xl transition-all duration-150 border-2 ${bg}`}
             />
           );
        })}
      </div>
      <div className="text-xs font-mono text-slate-400">Pattern Size: {config.count}</div>
    </div>
  );
};

// 6. Lock Pick
const LockPickGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [level, setLevel] = useState(0);
  const [angle, setAngle] = useState(0);
  const [targetAngle, setTargetAngle] = useState(0);
  
  // Refs for animation loop state to avoid closure staleness and re-renders
  const angleRef = useRef(0);
  const speedRef = useRef(0);
  const reqRef = useRef<number>(0);
  
  // Controls whether the loop is active
  const isPlayingRef = useRef(true);
  
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  const diffConfig = {
      EASY: { baseSpeed: 3.5, width: 60, levels: 2 },
      NORMAL: { baseSpeed: 4.5, width: 40, levels: 3 },
      HARD: { baseSpeed: 5.5, width: 30, levels: 3 },
      EXPERT: { baseSpeed: 6.5, width: 25, levels: 4 }
  }[difficulty];

  // Update speed ref when difficulty changes
  useEffect(() => {
      speedRef.current = diffConfig.baseSpeed;
  }, [diffConfig.baseSpeed]);

  // Initialize Level Logic
  const initLevel = () => {
    angleRef.current = 0;
    setAngle(0);
    setTargetAngle(Math.random() * 240 + 60);
  };

  // Main Loop - Rewritten to be time-based and robust
  useEffect(() => {
    // Ensure speed is set before loop starts
    speedRef.current = diffConfig.baseSpeed;
    
    // State initialization
    initLevel();
    isPlayingRef.current = true;
    
    let lastTime: number | null = null;
    
    const loop = (time: number) => {
        if (!isPlayingRef.current) return;

        if (lastTime !== null) {
            const delta = time - lastTime;
            // 0.06 deg/ms roughly matches the original 1.5 deg/16ms feel 
            // baseSpeed 1 = 60 deg/sec
            const move = (0.06 * speedRef.current) * delta;
            
            angleRef.current = (angleRef.current + move) % 360;
            setAngle(angleRef.current); // Force React Render
        }
        
        lastTime = time;
        reqRef.current = requestAnimationFrame(loop);
    };

    reqRef.current = requestAnimationFrame(loop);

    return () => {
        isPlayingRef.current = false;
        cancelAnimationFrame(reqRef.current);
    };
  }, []); // Empty dependency to run once on mount

  const click = () => {
    if (onInteraction) onInteraction();
    
    const diff = Math.abs(angleRef.current - targetAngle);
    const width = diffConfig.width;
    
    if (diff <= width / 2) {
       trigger(true);
       if (level >= diffConfig.levels - 1) {
          isPlayingRef.current = false; // Stop loop
          setTimeout(() => onComplete(true), 300);
       } else {
          setLevel(l => l + 1);
          speedRef.current += 0.5; 
          initLevel();
       }
    } else {
       trigger(false);
       // Reset current level try only
       initLevel();
    }
  };

  return (
    <div 
      className={`flex flex-col items-center gap-8 w-full h-full justify-center rounded-3xl ${bgClass}`}
      onMouseDown={click}
    >
      <div className="flex flex-col items-center">
         <div className="text-xl font-bold mb-2 text-slate-700 dark:text-slate-200">{t.lock_instr}</div>
         <div className="flex gap-2">
            {Array(diffConfig.levels).fill(0).map((_, i) => (
               <div key={i} className={`w-3 h-3 rounded-full ${i < level ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
            ))}
         </div>
      </div>

      <div className="relative w-64 h-64 cursor-pointer">
         {/* Track */}
         <div className="absolute inset-0 rounded-full border-8 border-slate-200 dark:border-slate-800" />
         
         {/* Target Zone */}
         <div 
            className="absolute inset-0 rounded-full transition-all duration-300"
            style={{
               background: `conic-gradient(transparent ${targetAngle - diffConfig.width/2}deg, #22c55e ${targetAngle - diffConfig.width/2}deg ${targetAngle + diffConfig.width/2}deg, transparent ${targetAngle + diffConfig.width/2}deg)`,
               maskImage: 'radial-gradient(transparent 65%, black 66%)',
               WebkitMaskImage: 'radial-gradient(transparent 65%, black 66%)'
            }}
         />

         {/* Center */}
         <div className="absolute inset-0 flex items-center justify-center">
             <Icons.Lock className="w-16 h-16 text-slate-400 dark:text-slate-600" />
         </div>

         {/* Needle */}
         <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `rotate(${angle}deg)` }}
         >
             <div className="w-2 h-1/2 bg-transparent relative">
                <div className={`absolute top-0 w-4 h-4 -ml-1 bg-slate-800 dark:bg-white rounded-full shadow-sm ${tutorialEnabled ? 'ring-2 ring-blue-400' : ''}`} />
             </div>
         </div>
         
         {tutorialEnabled && (
            <div className="absolute bottom-[-40px] left-0 right-0 text-center text-xs text-blue-500 animate-bounce">
                Tap when needle hits green!
            </div>
         )}
      </div>
    </div>
  );
};

// 7. Scramble Password
const PasswordGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [layout, setLayout] = useState([1,2,3,4,5,6,7,8,9,0]);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  // Config: Length of code
  const codeLength = {
      EASY: { count: 3 },
      NORMAL: { count: 4 },
      HARD: { count: 6 },
      EXPERT: { count: 8 }
  }[difficulty];

  useEffect(() => {
    // Generate code based on length
    let c = '';
    for(let i=0; i<codeLength.count; i++) c += Math.floor(Math.random()*10);
    setCode(c);
    // IMPORTANT: Only re-run if DIFFICULTY string changes, not the object reference.
    // The previous bug was depending on `codeLength` which is a new object on every render.
  }, [difficulty]); // Changed from [codeLength] to [difficulty]

  const shuffle = () => {
    setLayout([...layout].sort(() => Math.random() - 0.5));
  };

  const press = (n: number) => {
    if (onInteraction) onInteraction();
    audio.playClick();
    const next = input + n;
    setInput(next);
    if (next === code) {
       trigger(true);
       setTimeout(() => onComplete(true), 200);
    }
    else if (next.length >= codeLength.count) {
       trigger(false);
       setInput('');
       shuffle();
    } else {
       shuffle();
    }
  };

  // Tutorial Helper: find the next number to press
  const nextRequired = code[input.length];

  return (
     <div className={`flex flex-col items-center gap-4 w-full h-full justify-center rounded-3xl ${bgClass}`}>
       <div className="text-sm text-slate-500">{t.type_code} <span className="text-slate-800 dark:text-white font-mono text-xl ml-2 tracking-widest bg-slate-200 dark:bg-slate-700 px-2 rounded">{code}</span></div>
       <div className="text-4xl font-mono tracking-[0.5em] text-blue-500 dark:text-blue-400 h-12 border-b-2 border-blue-500/30 mb-4 text-center">
         {input.padEnd(codeLength.count, '•')}
       </div>
       <div className="flex flex-wrap justify-center gap-2 max-w-xs">
         {layout.map(n => {
            const isNext = tutorialEnabled && n.toString() === nextRequired;
            return (
                <Button 
                    key={n} 
                    onClick={() => press(n)} 
                    onInteraction={onInteraction}
                    className={`bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-800 dark:text-white w-16 h-16 text-2xl font-mono border border-slate-200 dark:border-slate-600 ${isNext ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30' : ''}`}
                >
                    {n}
                </Button>
            );
         })}
       </div>
     </div>
  );
};

// 8. Aim Lab (Burst)
const BurstGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [target, setTarget] = useState<{id: number, x: number, y: number, size: number} | null>(null);
  const [score, setScore] = useState(0);
  const t = MINI_GAME_TRANSLATIONS[language];
  const reqRef = useRef(0);
  const failedRef = useRef(false);

  // Config: Targets count and shrink speed
  const config = {
      EASY: { count: 3, shrink: 1.4 },
      NORMAL: { count: 5, shrink: 1.6 },
      HARD: { count: 8, shrink: 1.7 },
      EXPERT: { count: 12, shrink: 1.8 }
  }[difficulty];

  const createTarget = () => ({
    id: Math.random(),
    x: Math.random() * 80 + 10,
    y: Math.random() * 80 + 10,
    size: 100 
  });

  const spawn = () => {
     setTarget(createTarget());
  };

  useEffect(() => { spawn(); }, []);

  useEffect(() => {
     const loop = () => {
        if (failedRef.current) return;
        setTarget(curr => {
           if (!curr) return null;
           const nextSize = curr.size - config.shrink; 
           if (nextSize <= 0) {
              audio.playFailure();
              // In easy mode, maybe don't reset score? For now, keep punishment consistent
              return createTarget(); 
           }
           return { ...curr, size: nextSize };
        });
        reqRef.current = requestAnimationFrame(loop);
     };
     reqRef.current = requestAnimationFrame(loop);
     return () => cancelAnimationFrame(reqRef.current);
  }, [config.shrink]); 

  const hit = () => {
     if (onInteraction) onInteraction();
     audio.playPop();
     const next = score + 1;
     setScore(next);
     if (next >= config.count) {
        failedRef.current = true; // Stop loop
        setTarget(null);
        audio.playSuccess();
        onComplete(true);
     } else {
        spawn();
     }
  };

  return (
    <div className="w-full h-full relative min-h-[300px] bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden cursor-crosshair">
       <div className="absolute top-2 left-4 text-xs font-mono text-slate-500 pointer-events-none select-none z-10">
          {t.burst_instr} {score}/{config.count}
       </div>
       {target && (
         <button
           key={target.id}
           onMouseDown={(e) => { e.stopPropagation(); hit(); }}
           className="absolute rounded-full bg-red-500 border-2 border-white shadow-lg active:scale-110 transition-transform"
           style={{ 
               top: `${target.y}%`, 
               left: `${target.x}%`, 
               width: `${40 + target.size * 0.4}px`, // Min 40px
               height: `${40 + target.size * 0.4}px`,
               transform: 'translate(-50%, -50%)',
               opacity: target.size / 100 + 0.2
           }}
         >
           <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
           </div>
           {tutorialEnabled && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-600 font-bold whitespace-nowrap">CLICK!</div>
           )}
         </button>
       )}
    </div>
  );
};

// 9. Sequence
const SequenceGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const [next, setNext] = useState(1);
  const [buttons, setButtons] = useState<number[]>([]);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();
  
  // Config: Max number
  const maxNum = {
      EASY: { count: 3 },
      NORMAL: { count: 5 },
      HARD: { count: 7 },
      EXPERT: { count: 9 }
  }[difficulty];

  useEffect(() => {
    setButtons(Array.from({length: maxNum.count}, (_, i) => i + 1).sort(() => Math.random() - 0.5));
    // IMPORTANT: Only re-run if DIFFICULTY string changes, not the object reference.
  }, [difficulty]); // Changed from [maxNum] to [difficulty]

  const click = (n: number) => {
    if (onInteraction) onInteraction();
    audio.playClick();
    if (n === next) {
      if (n === maxNum.count) {
        trigger(true);
        setTimeout(() => onComplete(true), 200);
      }
      setNext(next + 1);
    } else {
      trigger(false);
      setNext(1);
      setButtons(Array.from({length: maxNum.count}, (_, i) => i + 1).sort(() => Math.random() - 0.5));
    }
  };

  return (
    <div className={`flex flex-col items-center gap-6 w-full h-full justify-center rounded-3xl transition-colors ${bgClass}`}>
      <div className="text-xl text-slate-800 dark:text-white">{t.sequence_instr} <span className="font-bold text-blue-500">1 → {maxNum.count}</span></div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[320px]">
        {buttons.map(n => {
          const isNext = tutorialEnabled && n === next;
          return (
            <Button 
                key={n} 
                onClick={() => click(n)} 
                onInteraction={onInteraction}
                className={`${n < next ? 'bg-green-500 opacity-20 scale-90 text-white' : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-600'} w-20 h-20 text-3xl transition-all duration-200 ${isNext ? 'ring-4 ring-blue-400 animate-pulse' : ''}`}
            >
                {n}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

// Helper: shortest distance from point (px,py) to segment (ax,ay)-(bx,by)
const pointToSegDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// 10. Mouse Maze – don't touch the red!
const MouseMazeGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const SIZE = 280;
  const t = MINI_GAME_TRANSLATIONS[language];

  const cfg = {
    EASY:   { waypoints: [[20,70],[80,70],[80,210],[140,210],[140,70],[200,70],[200,210],[260,210]]                                                                    as [number,number][], halfW: 10 },
    NORMAL: { waypoints: [[20,50],[65,50],[65,230],[115,230],[115,50],[165,50],[165,230],[215,230],[215,75],[260,75]]                                                 as [number,number][], halfW: 8 },
    HARD:   { waypoints: [[20,40],[57,40],[57,240],[95,240],[95,40],[133,40],[133,240],[171,240],[171,40],[209,40],[209,240],[260,240]]                               as [number,number][], halfW: 6 },
    EXPERT: { waypoints: [[20,30],[50,30],[50,250],[80,250],[80,50],[110,50],[110,250],[140,250],[140,50],[170,50],[170,250],[200,250],[200,50],[230,50],[230,250],[260,250]] as [number,number][], halfW: 5 },
  }[difficulty];

  const { waypoints, halfW } = cfg;
  const start = waypoints[0];
  const end   = waypoints[waypoints.length - 1];

  const [started, setStarted] = React.useState(false);
  const [failed,  setFailed]  = React.useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const inChannel = (mx: number, my: number) => {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [ax, ay] = waypoints[i];
      const [bx, by] = waypoints[i + 1];
      if (pointToSegDist(mx, my, ax, ay, bx, by) <= halfW) return true;
    }
    return false;
  };

  const toSvgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (SIZE / rect.width),
      (e.clientY - rect.top)  * (SIZE / rect.height),
    ] as [number, number];
  };

  const triggerFail = () => {
    setFailed(true);
    audio.playFailure();
    setTimeout(() => { setStarted(false); setFailed(false); }, 700);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (failed) return;
    const [mx, my] = toSvgCoords(e);

    if (!started) {
      if (Math.hypot(mx - start[0], my - start[1]) <= halfW) {
        setStarted(true);
        if (onInteraction) onInteraction();
      }
      return;
    }

    if (onInteraction) onInteraction();

    if (!inChannel(mx, my)) { triggerFail(); return; }

    if (Math.hypot(mx - end[0], my - end[1]) <= halfW) {
      audio.playSuccess();
      onComplete(true);
    }
  };

  const handleMouseLeave = () => { if (started && !failed) triggerFail(); };

  const polyPts = waypoints.map(p => p.join(',')).join(' ');

  return (
    <div className="flex flex-col items-center gap-3 w-full h-full justify-center">
      <div className="text-sm font-mono text-slate-500 dark:text-slate-400 h-5 text-center">
        {failed ? '❌' : started ? t.maze_playing : t.maze_start}
      </div>
      <div className={`rounded-2xl overflow-hidden border-4 transition-all duration-150 select-none ${
        failed  ? 'border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.6)]'
        : started ? 'border-green-400'
        : 'border-slate-300 dark:border-slate-700'
      }`}>
        <svg
          ref={svgRef}
          width={SIZE} height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Danger zone background */}
          <rect width={SIZE} height={SIZE} fill="#dc2626" />

          {/* Safe path */}
          <polyline points={polyPts} fill="none" stroke="white"
            strokeWidth={halfW * 2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Tutorial: dashed guide line */}
          {tutorialEnabled && (
            <polyline points={polyPts} fill="none" stroke="rgba(59,130,246,0.6)"
              strokeWidth="2" strokeDasharray="8 5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* End zone – gold star */}
          <circle cx={end[0]} cy={end[1]} r={halfW * 0.85} fill="#f59e0b" />
          <text x={end[0]} y={end[1]} textAnchor="middle" dominantBaseline="central"
            fontSize={halfW > 18 ? 18 : 12} fill="white"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>⭐</text>

          {/* Start zone – green circle with pulse when waiting */}
          <circle cx={start[0]} cy={start[1]} r={halfW * 0.85}
            fill={started ? '#22c55e' : '#4ade80'} />
          {!started && (
            <circle cx={start[0]} cy={start[1]} r={halfW * 0.85}
              fill="none" stroke="#4ade80" strokeWidth="3" opacity="0.7">
              <animate attributeName="r"
                values={`${halfW * 0.85};${halfW * 1.4};${halfW * 0.85}`}
                dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity"
                values="0.7;0;0.7" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Fail overlay */}
          {failed && <rect width={SIZE} height={SIZE} fill="rgba(239,68,68,0.35)" />}
        </svg>
      </div>
      {tutorialEnabled && !started && (
        <div className="text-xs text-blue-400 text-center">{t.maze_hint}</div>
      )}
    </div>
  );
};

// --- Gravity Maze types ---
type GravCol = { x: number; gapY: number; gapH: number };

// 11. Gravity Maze
const GravityMazeGame = ({ onComplete, onInteraction, language, difficulty = 'NORMAL', tutorialEnabled }: Props) => {
  const W = 310, H = 240, BSIZE = 14, COL_W = 16, GOAL_X = 286, SPIKE_H = 10;
  const t = MINI_GAME_TRANSLATIONS[language];

  const cfg = React.useMemo(() => ({
    EASY:   { cols: [{x:110,gapY:70,gapH:110},{x:210,gapY:80,gapH:110}]                                                          as GravCol[], speed:1.0, grav:0.050, maxVel:2.0 },
    NORMAL: { cols: [{x:105,gapY:56,gapH:96},{x:215,gapY:98,gapH:96}]                                                            as GravCol[], speed:1.1, grav:0.058, maxVel:2.3 },
    HARD:   { cols: [{x:90,gapY:52,gapH:110},{x:170,gapY:108,gapH:100},{x:248,gapY:100,gapH:100}]                                    as GravCol[], speed:1.35, grav:0.070, maxVel:2.8 },
    EXPERT: { cols: [{x:80,gapY:60,gapH:150},{x:148,gapY:112,gapH:160},{x:214,gapY:68,gapH:100},{x:272,gapY:112,gapH:164}]          as GravCol[], speed:1.4,  grav:0.085, maxVel:3.3 },
  })[difficulty], [difficulty]);

  // All physics in refs — no closure staleness in rAF
  const bxRef      = useRef(20);
  const byRef      = useRef(H / 2 - BSIZE / 2);
  const velRef     = useRef(0);
  const gravRef    = useRef<1 | -1>(1);
  const startedRef = useRef(false);
  const doneRef    = useRef(false);
  const reqRef     = useRef(0);
  const cfgRef     = useRef(cfg); cfgRef.current = cfg;
  const onCompleteRef   = useRef(onComplete);   onCompleteRef.current   = onComplete;
  const onInteractRef   = useRef(onInteraction); onInteractRef.current   = onInteraction;

  const [display, setDisplay] = useState({
    bx: 20, by: H / 2 - BSIZE / 2, gravDir: 1 as 1 | -1, started: false, dead: false,
  });

  const resetBlock = useCallback(() => {
    bxRef.current  = 20;
    byRef.current  = H / 2 - BSIZE / 2;
    velRef.current = 0;
    gravRef.current = 1;
  }, []);

  useEffect(() => {
    doneRef.current = false;
    resetBlock();

    const loop = () => {
      if (doneRef.current) return;
      const c = cfgRef.current;

      if (startedRef.current) {
        velRef.current = Math.max(-c.maxVel, Math.min(c.maxVel,
          velRef.current + gravRef.current * c.grav
        ));
        bxRef.current += c.speed;
        byRef.current += velRef.current;

        const bx = bxRef.current, by = byRef.current;

        let hit = by < SPIKE_H || by + BSIZE > H - SPIKE_H;
        if (!hit) {
          for (const col of c.cols) {
            if (bx + BSIZE > col.x && bx < col.x + COL_W) {
              if (by < col.gapY || by + BSIZE > col.gapY + col.gapH) { hit = true; break; }
            }
          }
        }

        if (hit) {
          audio.playFailure();
          startedRef.current = false;
          resetBlock();
          setDisplay({ bx: 20, by: H / 2 - BSIZE / 2, gravDir: 1, started: false, dead: true });
          setTimeout(() => setDisplay(d => ({ ...d, dead: false })), 600);
        } else if (bx + BSIZE >= GOAL_X) {
          doneRef.current = true;
          audio.playSuccess();
          onCompleteRef.current(true);
          return;
        } else {
          setDisplay({ bx, by, gravDir: gravRef.current, started: true, dead: false });
        }
      }

      reqRef.current = requestAnimationFrame(loop);
    };

    reqRef.current = requestAnimationFrame(loop);
    return () => { doneRef.current = true; cancelAnimationFrame(reqRef.current); };
  }, [resetBlock]);

  const handleClick = () => {
    if (doneRef.current) return;
    if (onInteractRef.current) onInteractRef.current();
    if (!startedRef.current) {
      startedRef.current = true;
      setDisplay(d => ({ ...d, started: true, dead: false }));
    } else {
      gravRef.current = gravRef.current === 1 ? -1 : 1;
      audio.playClick();
    }
  };

  const { bx, by, gravDir, started, dead } = display;
  const spikeCount = Math.ceil(W / 16);

  return (
    <div className="flex flex-col items-center gap-3 w-full justify-center">
      <div className="text-sm font-mono text-slate-500 dark:text-slate-400 h-5 text-center">
        {dead ? '💥' : started ? t.gravity_instr : t.gravity_start}
      </div>
      <div
        className={`rounded-xl overflow-hidden border-2 cursor-pointer select-none transition-colors ${
          dead ? 'border-red-500' : started ? 'border-indigo-400' : 'border-slate-300 dark:border-slate-600'
        }`}
        onMouseDown={handleClick}
      >
        <svg width={W} height={H} className="block" style={{ background: '#0f172a' }}>
          {/* Top & bottom wall spikes */}
          {Array.from({ length: spikeCount }, (_, i) => (
            <React.Fragment key={i}>
              <polygon points={`${i*16},0 ${i*16+16},0 ${i*16+8},10`} fill="#475569" />
              <polygon points={`${i*16},${H} ${i*16+16},${H} ${i*16+8},${H-10}`} fill="#475569" />
            </React.Fragment>
          ))}

          {/* Obstacle columns */}
          {cfg.cols.map((col, idx) => (
            <g key={idx}>
              {col.gapY > 0 && <rect x={col.x} y={0} width={COL_W} height={col.gapY} fill="#dc2626" />}
              {col.gapY + col.gapH < H && <rect x={col.x} y={col.gapY + col.gapH} width={COL_W} height={H - col.gapY - col.gapH} fill="#dc2626" />}
              <polygon points={`${col.x},${col.gapY} ${col.x+COL_W},${col.gapY} ${col.x+COL_W/2},${col.gapY+10}`} fill="#fca5a5" />
              <polygon points={`${col.x},${col.gapY+col.gapH} ${col.x+COL_W},${col.gapY+col.gapH} ${col.x+COL_W/2},${col.gapY+col.gapH-10}`} fill="#fca5a5" />
            </g>
          ))}

          {/* Goal zone */}
          <rect x={GOAL_X} y={0} width={W - GOAL_X} height={H} fill="#064e3b" />
          <text x={GOAL_X + (W - GOAL_X) / 2} y={H / 2} textAnchor="middle" dominantBaseline="central"
            fontSize="18" style={{ userSelect: 'none', pointerEvents: 'none' }}>⭐</text>

          {/* Block */}
          <rect x={bx} y={by} width={BSIZE} height={BSIZE}
            fill={gravDir === 1 ? '#818cf8' : '#34d399'} rx="3" />
          <text x={bx + BSIZE / 2} y={gravDir === 1 ? by - 3 : by + BSIZE + 9}
            textAnchor="middle" fontSize="8" fill="white"
            style={{ userSelect: 'none', pointerEvents: 'none' }}>
            {gravDir === 1 ? '▼' : '▲'}
          </text>

          {/* Start / retry / tutorial prompt */}
          {!started && (
            <text x={W / 2} y={H / 2 - 14} textAnchor="middle" fontSize="13"
              fill={dead ? '#f87171' : '#94a3b8'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}>
              {dead ? t.gravity_retry : t.gravity_start}
            </text>
          )}
          {tutorialEnabled && !started && !dead && (
            <text x={W / 2} y={H / 2 + 6} textAnchor="middle" fontSize="11" fill="#60a5fa"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>
              Click = flip gravity
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};

export const MiniGameRenderer = (props: Props) => {
  const { type } = props;

  switch (type) {
    case 'math': return <MathGame {...props} />;
    case 'mash': return <MashGame {...props} />;
    case 'stroop': return <StroopGame {...props} />;
    case 'reaction': return <ReactionGame {...props} />;
    case 'memory': return <MatrixGame {...props} />;
    case 'lockpick': return <LockPickGame {...props} />;
    case 'password': return <PasswordGame {...props} />;
    case 'burst': return <BurstGame {...props} />;
    case 'sequence': return <SequenceGame {...props} />;
    case 'mousemaze': return <MouseMazeGame {...props} />;
    case 'gravitymaze': return <GravityMazeGame {...props} />;
    default: return <MashGame {...props} />;
  }
};