import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Language } from '../types';
import { MINI_GAME_TRANSLATIONS, Icons } from '../constants';
import { audio } from '../services/audio';

interface Props {
  type: string;
  onComplete: (success: boolean) => void;
  playerId: 'P1' | 'P2';
  language: Language;
}

const Button = ({ onClick, children, className, style, disabled }: any) => (
  <button 
    onClick={(e) => { 
      e.stopPropagation(); 
      if (!disabled) { 
        audio.playClick();
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

// 1. Math Rush
const MathGame = ({ onComplete, language }: Props) => {
  const [problem, setProblem] = useState({ q: '', a: 0, options: [] as number[] });
  const [score, setScore] = useState(0);
  const TARGET_SCORE = 3;
  const { trigger, bgClass } = useFeedback();
  const t = MINI_GAME_TRANSLATIONS[language];
  
  const generateProblem = () => {
    const op = Math.random() > 0.5 ? '+' : '-';
    let a, b, ans;
    if (op === '+') {
       a = Math.floor(Math.random() * 40) + 10;
       b = Math.floor(Math.random() * 40) + 10;
       ans = a + b;
    } else {
       a = Math.floor(Math.random() * 50) + 20;
       b = Math.floor(Math.random() * 20) + 1;
       ans = a - b;
    }
    
    const opts = new Set<number>();
    opts.add(ans);
    while(opts.size < 4) {
       const diff = Math.floor(Math.random() * 5) + 1;
       const dir = Math.random() > 0.5 ? 1 : -1;
       opts.add(ans + (diff * dir));
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
      if (newScore >= TARGET_SCORE) {
        setTimeout(() => onComplete(true), 200);
      } else {
        generateProblem();
      }
    }
  };

  return (
    <div className={`flex flex-col items-center gap-6 w-full h-full justify-center rounded-3xl transition-colors duration-200 ${bgClass}`}>
      <div className="flex justify-between w-full max-w-xs text-sm text-slate-500 dark:text-slate-400 font-mono">
         <span>{t.score}: {score}/{TARGET_SCORE}</span>
      </div>
      <div className="text-5xl font-black mb-4 tracking-wider text-slate-800 dark:text-white drop-shadow-sm">{problem.q}</div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        {problem.options.map((opt, i) => (
          <Button key={i} onClick={() => handleAnswer(opt)} className="bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-6 text-2xl border border-slate-200 dark:border-slate-600">
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
};

// 2. Power Mash
const MashGame = ({ onComplete, language }: Props) => {
  const [progress, setProgress] = useState(30);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  const mash = () => {
    audio.playPop(); // Special sound for mash
    setProgress(p => Math.min(100, p + 8));
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
        return Math.max(0, p - 1.5);
      });
    }, 50);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className={`flex flex-col items-center w-full gap-6 h-full justify-center rounded-3xl ${bgClass}`}>
      <div className="text-xl font-bold animate-pulse text-yellow-500">{t.mash_instr}</div>
      <div className="w-full max-w-xs h-8 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-300 dark:border-slate-600">
        <div 
           className="h-full transition-all duration-75 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
           style={{ width: `${progress}%` }}
        />
      </div>
      <Button 
        onClick={mash} 
        className="w-40 h-40 rounded-full bg-red-500 border-b-8 border-red-700 active:border-b-0 active:translate-y-2 text-white text-2xl flex items-center justify-center hover:bg-red-400"
      >
        MASH!
      </Button>
    </div>
  );
};

// 3. Stroop Test
const StroopGame = ({ onComplete, language }: Props) => {
  const colors = [
    { name: language === 'zh' ? '红' : 'RED', hex: '#ef4444', id: 'red' },
    { name: language === 'zh' ? '蓝' : 'BLUE', hex: '#3b82f6', id: 'blue' },
    { name: language === 'zh' ? '绿' : 'GREEN', hex: '#22c55e', id: 'green' },
    { name: language === 'zh' ? '黄' : 'YELLOW', hex: '#eab308', id: 'yellow' },
  ];
  
  const [current, setCurrent] = useState({ text: colors[0], color: colors[1] });
  const [score, setScore] = useState(0);
  const TARGET = 5;
  const { trigger, bgClass } = useFeedback();
  const t = MINI_GAME_TRANSLATIONS[language];

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
       if (nextScore >= TARGET) setTimeout(() => onComplete(true), 200);
       else nextRound();
    } else {
       setScore(0);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-8 w-full h-full justify-center rounded-3xl transition-colors ${bgClass}`}>
      <div className="flex flex-col items-center">
        <div className="text-xl text-slate-500 dark:text-slate-400 mb-2">{t.stroop_instr}</div>
        <div className="text-sm font-mono text-slate-400">{t.score}: {score}/{TARGET}</div>
      </div>
      <div 
        className="text-7xl font-black tracking-widest drop-shadow-sm h-24"
        style={{ color: current.color.hex }}
      >
        {current.text.name}
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
         {colors.map(c => (
           <Button 
             key={c.id} 
             onClick={() => handleAnswer(c.id)}
             className="h-20 border-2 border-transparent hover:border-slate-300 dark:hover:border-white/20 shadow-none"
             style={{ backgroundColor: c.hex }}
           />
         ))}
      </div>
    </div>
  );
};

// 4. Reaction
const ReactionGame = ({ onComplete, language }: Props) => {
  const [status, setStatus] = useState<'WAIT' | 'GO' | 'EARLY' | 'SLOW' | 'RESULT'>('WAIT');
  const [resultMs, setResultMs] = useState(0);
  const timeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const t = MINI_GAME_TRANSLATIONS[language];
  const THRESHOLD = 350; // ms

  const start = () => {
    setStatus('WAIT');
    const delay = 1500 + Math.random() * 2500; 
    timeoutRef.current = window.setTimeout(() => {
      setStatus('GO');
      audio.playTone(600, 'square', 0.1); // Beep on GO
      startTimeRef.current = Date.now();
    }, delay);
  };

  useEffect(() => {
    start();
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const handleClick = () => {
    if (status === 'WAIT') {
      setStatus('EARLY');
      audio.playFailure();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else if (status === 'GO') {
      const diff = Date.now() - startTimeRef.current;
      setResultMs(diff);
      if (diff <= THRESHOLD) {
         setStatus('RESULT');
         audio.playSuccess();
         setTimeout(() => onComplete(true), 800);
      } else {
         setStatus('SLOW');
         audio.playFailure();
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
        <div 
        onMouseDown={handleClick} 
        className={`w-full max-w-sm aspect-square rounded-3xl flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-100 shadow-xl
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
        </div>
        {(status === 'EARLY' || status === 'SLOW') && (
            <Button onClick={start} className="bg-slate-700 text-white">{t.retry}</Button>
        )}
    </div>
  );
};

// 5. Memory Matrix
const MatrixGame = ({ onComplete, language }: Props) => {
  const [pattern, setPattern] = useState<number[]>([]);
  const [input, setInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<'WATCH' | 'INPUT'>('WATCH');
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const t = MINI_GAME_TRANSLATIONS[language];

  const start = () => {
    setInput([]);
    setWrongIdx(null);
    setPhase('WATCH');
    const p = new Set<number>();
    while(p.size < 5) p.add(Math.floor(Math.random() * 9));
    setPattern(Array.from(p));
    
    setTimeout(() => {
       setPhase('INPUT');
       audio.playTone(400, 'sine', 0.1);
    }, 1500);
  };

  useEffect(() => { start(); }, []);

  const handleClick = (i: number) => {
    if (phase === 'WATCH') return;
    if (input.includes(i)) return; 

    audio.playClick();
    if (pattern.includes(i)) {
       const next = [...input, i];
       setInput(next);
       if (next.length === pattern.length) {
          audio.playSuccess();
          setTimeout(() => onComplete(true), 300);
       }
    } else {
       setWrongIdx(i);
       audio.playFailure();
       setTimeout(() => start(), 800); 
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-xl font-bold text-blue-500 dark:text-blue-400">{phase === 'WATCH' ? t.repeat : t.repeat_go}</div>
      <div className="grid grid-cols-3 gap-3">
        {Array(9).fill(0).map((_, i) => {
           const isTarget = pattern.includes(i);
           const isSelected = input.includes(i);
           const isWrong = wrongIdx === i;
           
           let bg = 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700';
           if (phase === 'WATCH' && isTarget) bg = 'bg-white dark:bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]';
           if (phase === 'INPUT' && isSelected) bg = 'bg-green-500 shadow-[0_0_10px_#22c55e]';
           if (isWrong) bg = 'bg-red-500 animate-shake';

           return (
             <button
               key={i}
               onClick={(e) => { e.stopPropagation(); handleClick(i); }}
               className={`w-20 h-20 rounded-xl transition-all duration-150 border-2 ${bg}`}
             />
           );
        })}
      </div>
    </div>
  );
};

// 6. Lock Pick
const LockPickGame = ({ onComplete, language }: Props) => {
  const [level, setLevel] = useState(0);
  const [angle, setAngle] = useState(0);
  const [targetAngle, setTargetAngle] = useState(0);
  const [speed, setSpeed] = useState(1.5); 
  const reqRef = useRef(0);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  const TARGET_WIDTH = 40; 

  const startLevel = () => {
    setAngle(0);
    setTargetAngle(Math.random() * 240 + 60);
  };

  useEffect(() => {
    startLevel();
  }, []);

  useEffect(() => {
    const loop = () => {
      setAngle(prev => {
        let next = prev + speed;
        if (next >= 360) next = 0;
        return next;
      });
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [speed]);

  const click = () => {
    const diff = Math.abs(angle - targetAngle);
    if (diff <= TARGET_WIDTH / 2) {
       trigger(true);
       if (level >= 2) {
          setTimeout(() => onComplete(true), 300);
       } else {
          setLevel(l => l + 1);
          setSpeed(s => s + 0.5); 
          startLevel();
       }
    } else {
       trigger(false);
       setLevel(0);
       setSpeed(1.5); 
       startLevel();
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
            {[0, 1, 2].map(i => (
               <div key={i} className={`w-3 h-3 rounded-full ${i < level ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
            ))}
         </div>
      </div>

      <div className="relative w-64 h-64 cursor-pointer">
         {/* Track */}
         <div className="absolute inset-0 rounded-full border-8 border-slate-200 dark:border-slate-800" />
         
         {/* Target Zone */}
         <div 
            className="absolute inset-0 rounded-full"
            style={{
               background: `conic-gradient(transparent ${targetAngle - TARGET_WIDTH/2}deg, #22c55e ${targetAngle - TARGET_WIDTH/2}deg ${targetAngle + TARGET_WIDTH/2}deg, transparent ${targetAngle + TARGET_WIDTH/2}deg)`,
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
                <div className="absolute top-0 w-4 h-4 -ml-1 bg-slate-800 dark:bg-white rounded-full shadow-sm" />
             </div>
         </div>
      </div>
    </div>
  );
};

// 7. Scramble Password
const PasswordGame = ({ onComplete, language }: Props) => {
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [layout, setLayout] = useState([1,2,3,4,5,6,7,8,9,0]);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();

  useEffect(() => {
    setCode(Math.floor(Math.random() * 9000 + 1000).toString());
  }, []);

  const shuffle = () => {
    setLayout([...layout].sort(() => Math.random() - 0.5));
  };

  const press = (n: number) => {
    audio.playClick();
    const next = input + n;
    setInput(next);
    if (next === code) {
       trigger(true);
       setTimeout(() => onComplete(true), 200);
    }
    else if (next.length >= 4) {
       trigger(false);
       setInput('');
       shuffle();
    } else {
       shuffle();
    }
  };

  return (
     <div className={`flex flex-col items-center gap-4 w-full h-full justify-center rounded-3xl ${bgClass}`}>
       <div className="text-sm text-slate-500">{t.type_code} <span className="text-slate-800 dark:text-white font-mono text-xl ml-2 tracking-widest bg-slate-200 dark:bg-slate-700 px-2 rounded">{code}</span></div>
       <div className="text-4xl font-mono tracking-[0.5em] text-blue-500 dark:text-blue-400 h-12 border-b-2 border-blue-500/30 mb-4">
         {input.padEnd(4, '•')}
       </div>
       <div className="flex flex-wrap justify-center gap-2 max-w-xs">
         {layout.map(n => (
           <Button key={n} onClick={() => press(n)} className="bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-800 dark:text-white w-16 h-16 text-2xl font-mono border border-slate-200 dark:border-slate-600">
             {n}
           </Button>
         ))}
       </div>
     </div>
  );
};

// 8. Aim Lab (Burst) - FIXED LOGIC
const BurstGame = ({ onComplete, language }: Props) => {
  const [target, setTarget] = useState<{id: number, x: number, y: number, size: number} | null>(null);
  const [score, setScore] = useState(0);
  const TARGET_COUNT = 5;
  const t = MINI_GAME_TRANSLATIONS[language];
  const reqRef = useRef(0);
  const failedRef = useRef(false);

  const spawn = () => {
     setTarget({
        id: Math.random(),
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        size: 100 
     });
  };

  useEffect(() => { spawn(); }, []);

  useEffect(() => {
     const loop = () => {
        if (failedRef.current) return;
        setTarget(curr => {
           if (!curr) return null;
           const nextSize = curr.size - 0.8; 
           if (nextSize <= 0) {
              // CHANGE: Don't fail the whole game, just spawn new one (maybe sound failure)
              // This fixes the "no ball spawns after miss" issue
              audio.playFailure();
              spawn(); 
              return null;
           }
           return { ...curr, size: nextSize };
        });
        reqRef.current = requestAnimationFrame(loop);
     };
     reqRef.current = requestAnimationFrame(loop);
     return () => cancelAnimationFrame(reqRef.current);
  }, []); // Logic contained inside state setter

  const hit = () => {
     audio.playPop();
     const next = score + 1;
     setScore(next);
     if (next >= TARGET_COUNT) {
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
          {t.burst_instr} {score}/{TARGET_COUNT}
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
         </button>
       )}
    </div>
  );
};

// 9. Sequence
const SequenceGame = ({ onComplete, language }: Props) => {
  const [next, setNext] = useState(1);
  const [buttons, setButtons] = useState<number[]>([]);
  const t = MINI_GAME_TRANSLATIONS[language];
  const { trigger, bgClass } = useFeedback();
  
  useEffect(() => {
    setButtons([1, 2, 3, 4, 5].sort(() => Math.random() - 0.5));
  }, []);

  const click = (n: number) => {
    audio.playClick();
    if (n === next) {
      if (n === 5) {
        trigger(true);
        setTimeout(() => onComplete(true), 200);
      }
      setNext(next + 1);
    } else {
      trigger(false);
      setNext(1);
      setButtons([1, 2, 3, 4, 5].sort(() => Math.random() - 0.5));
    }
  };

  return (
    <div className={`flex flex-col items-center gap-6 w-full h-full justify-center rounded-3xl transition-colors ${bgClass}`}>
      <div className="text-xl text-slate-800 dark:text-white">{t.sequence_instr} <span className="font-bold text-blue-500">1 → 5</span></div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[320px]">
        {buttons.map(n => (
          <Button 
            key={n} 
            onClick={() => click(n)} 
            className={`${n < next ? 'bg-green-500 opacity-20 scale-90 text-white' : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-600'} w-20 h-20 text-3xl transition-all duration-200`}
          >
            {n}
          </Button>
        ))}
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
    default: return <MashGame {...props} />;
  }
};