import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Stats, Theme, TyperPunkGame } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { EndScreen } from './EndScreen';

interface Props {
    game: TyperPunkGame | null;
    text: string;
    input: string;
    stats: Stats;
    attribution?: string;
    onInput: (input: string, accuracy: number, mistakes: number) => void;
    onFinish: (
        finalStats: Stats,
        wpmHistory: Array<{ time: number; wpm: number; raw: number; isError: boolean }>,
        finalUserInput: string,
        charTimings: Array<{ time: number; isCorrect: boolean; char: string; index: number }>,
        keypressHistory: Array<{ time: number; index: number; isCorrect: boolean }>
    ) => void;
    onReset: () => void;
    onMainMenu: () => void;
}

// Error boundary for TypingGame
class TypingGameErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    componentDidCatch(error: Error, errorInfo: any) {
        console.error('TypingGame error boundary caught:', error, errorInfo);
    }
    render() {
        if (this.state.error) {
            return <div style={{ color: 'red', padding: 32, background: '#111', minHeight: '100vh' }}>TypingGame Error: {this.state.error.message}</div>;
        }
        return this.props.children;
    }
}

export const TypingGame: React.FC<Props> = React.memo((props: Props): JSX.Element => {
    const { game, text, stats, attribution, onInput, onFinish, onReset, onMainMenu } = props;
    const { theme, toggleTheme } = useTheme();
    const [isFinished, setIsFinished] = useState(false);
    const [wpmHistory, setWpmHistory] = useState<Array<{ time: number; wpm: number; raw: number; isError: boolean }>>([]);
    const [finalStats, setFinalStats] = useState<Stats | null>(null);
    const [finalUserInput, setFinalUserInput] = useState<string>('');
    const [localInput, setLocalInput] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [wasmAccuracy, setWasmAccuracy] = useState<number>(100);
    const [wasmMistakes, setWasmMistakes] = useState<number>(0);
    const gameRef = useRef(game);
    const isInitialized = useRef(false);
    const lastInputRef = useRef('');
    const inputQueueRef = useRef<string[]>([]);
    const isProcessingQueueRef = useRef(false);
    const [charTimings, setCharTimings] = useState<Array<{ time: number; isCorrect: boolean; char: string; index: number }>>([]);
    const gameStartTimeRef = useRef<number | null>(null);
    const [finalCharTimings, setFinalCharTimings] = useState<Array<{ time: number; isCorrect: boolean; char: string; index: number }>>([]);
    // Persistent mistake tracking
    const [allMistakes, setAllMistakes] = useState<Array<{ time: number; index: number }>>([]);
    const [finalAllMistakes, setFinalAllMistakes] = useState<Array<{ time: number; index: number }>>([]);
    // Persistent keypress history tracking
    const [keypressHistory, setKeypressHistory] = useState<Array<{ time: number, index: number, isCorrect: boolean }>>([]);
    const [finalKeypressHistory, setFinalKeypressHistory] = useState<Array<{ time: number, index: number, isCorrect: boolean }>>([]);
    const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 700);

    // Initialize game only once
    useEffect(() => {
        if (game) {
            gameRef.current = game;
            isInitialized.current = true;
            // Reset local state when game changes
            setIsFinished(false);
            setFinalStats(null);
            setFinalUserInput('');
            setLocalInput('');
            lastInputRef.current = '';
            setWpmHistory([]);
            inputQueueRef.current = [];
            isProcessingQueueRef.current = false;
            
            // Ensure input is enabled and focused
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.disabled = false;
                    inputRef.current.focus();
                }
            }, 100);
        }
    }, [game]);

    // Cleanup processing timeout
    useEffect(() => {
        return () => {
            // No cleanup needed anymore
        };
    }, []);

    // Focus input on mount and when component updates
    useEffect(() => {
        const focusInput = () => {
            if (inputRef.current && !isFinished) {
                inputRef.current.disabled = false;
                inputRef.current.focus();
            }
        };

        const handleVisibilityChange = () => {
            if (!document.hidden && !isFinished) {
                // Small delay to ensure the page is fully visible
                setTimeout(focusInput, 100);
            }
        };

        const handleWindowFocus = () => {
            if (!isFinished) {
                focusInput();
            }
        };

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.typing-game') && !isFinished) {
                focusInput();
            }
        };

        const handleKeyDown = () => {
            // If user presses any key and input is not focused, focus it
            if (!isFinished && document.activeElement !== inputRef.current) {
                focusInput();
            }
        };

        // Initial focus with delay to ensure component is mounted
        setTimeout(focusInput, 50);

        // Add event listeners
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('click', handleClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isFinished]);

    // Update WPM history on every input/time change
    useEffect(() => {
        if (stats.time > 0 && !isFinished && gameRef.current) {
            const game = gameRef.current;
            const time = typeof game.get_time_elapsed === 'function' ? game.get_time_elapsed() : 0;
            const wpm = typeof game.get_wpm === 'function' ? game.get_wpm() : 0;
            const raw = typeof game.get_raw_wpm === 'function' ? game.get_raw_wpm() : 0;
            // Track error positions for this input
            let isError = false;
            if (typeof game.get_stats_and_input === 'function') {
                const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
                // If mistakes increased, mark as error
                if (mistakes > 0) isError = true;
            }
            setWpmHistory(prev => [
                ...prev,
                {
                    time,
                    wpm,
                    raw,
                    isError
                }
            ]);
        }
    }, [stats.time, isFinished]);

    // Update game text
    useEffect(() => {
        if (gameRef.current && text) {
            try {
                gameRef.current.set_text(text);
            } catch (err) {
                console.error('Error updating game text:', err);
            }
        }
    }, [text]);

    // Process input queue
    const processInputQueue = React.useCallback(() => {
        if (isProcessingQueueRef.current || inputQueueRef.current.length === 0) return;

        isProcessingQueueRef.current = true;

        try {
            const game = gameRef.current;
            if (!game) return;

            const nextInput = inputQueueRef.current[0];
            
            // Process input
            try {
                game.handle_input(nextInput);
                const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
                setLocalInput(wasmInput);
                lastInputRef.current = wasmInput;
                setWasmAccuracy(accuracy);
                setWasmMistakes(mistakes);
                onInput(wasmInput, accuracy, mistakes);

                // Check if game is finished using WASM game's is_finished method
                if (game.is_finished()) {
                    setIsFinished(true);
                    // Get latest stats from WASM
                    let accuracy = 100, mistakes = 0;
                    if (typeof game.get_stats === 'function') {
                        try {
                            [accuracy, mistakes] = game.get_stats();
                        } catch (err) {
                            // fallback to last known
                        }
                    }
                    const finalStats = {
                        ...stats,
                        accuracy,
                        incorrectChars: mistakes
                    };
                    setFinalStats(finalStats);
                    setFinalUserInput(wasmInput);
                    // Rebuild charTimings from final input and text
                    const rebuiltCharTimings = [];
                    for (let i = 0; i < wasmInput.length; i++) {
                        rebuiltCharTimings.push({
                            time: (i / wasmInput.length) * stats.time,
                            isCorrect: wasmInput[i] === text[i],
                            char: wasmInput[i],
                            index: i,
                        });
                    }
                    setFinalCharTimings(rebuiltCharTimings);
                    setFinalAllMistakes([...allMistakes]); // snapshot mistakes
                    if (inputRef.current) inputRef.current.disabled = true;
                    setFinalKeypressHistory(keypressHistory);
                    onFinish(finalStats, [...wpmHistory], wasmInput, rebuiltCharTimings, keypressHistory);
                    return; // Exit early to prevent further processing
                }
            } catch (err) {
                console.error('WASM operation error:', err);
                setLocalInput(nextInput);
                lastInputRef.current = nextInput;
            }

            // Remove processed input from queue
            inputQueueRef.current.shift();
        } catch (err) {
            console.error('WASM operation error:', err);
            if (inputQueueRef.current.length > 0) {
                const nextInput = inputQueueRef.current[0];
                setLocalInput(nextInput);
                lastInputRef.current = nextInput;
                inputQueueRef.current.shift();
            }
        }
        isProcessingQueueRef.current = false;

        // Process next input if any
        if (inputQueueRef.current.length > 0) {
            requestAnimationFrame(processInputQueue);
        }
    }, [onInput, text, stats, onFinish, wpmHistory, allMistakes, keypressHistory]);

    // Handle input changes
    const handleInput = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!gameRef.current || isFinished || isProcessingQueueRef.current) return;

        const newInput = e.target.value;
        if (newInput.length > text.length) return;

        inputQueueRef.current.push(newInput);
        if (!isProcessingQueueRef.current) {
            processInputQueue();
        }
    }, [isFinished, text.length, processInputQueue]);

    // Handle backspace
    const handleKeyDown = React.useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!gameRef.current || isFinished || isProcessingQueueRef.current) return;

        if (e.key === 'Backspace') {
            e.preventDefault();
            try {
                const ctrl = e.ctrlKey || e.metaKey;
                const success = await gameRef.current.handle_backspace(ctrl);
                if (success) {
                    const [wasmInput, accuracy, mistakes] = await gameRef.current.get_stats_and_input();
                    setLocalInput(wasmInput);
                    lastInputRef.current = wasmInput;
                    setWasmAccuracy(accuracy);
                    setWasmMistakes(mistakes);
                    onInput(wasmInput, accuracy, mistakes);
                }
            } catch (err) {
                console.error('WASM operation error:', err);
                setLocalInput(lastInputRef.current);
            }
        }
    }, [isFinished, onInput]);

    // Remove the text-based reset effect since we're handling it in the game effect
    useEffect(() => {
        if (!gameRef.current || isFinished) return;
        
        try {
            const [accuracy, mistakes] = gameRef.current.get_stats();
            setWasmAccuracy(accuracy);
            setWasmMistakes(mistakes);
        } catch (err) {
            console.error('WASM stats update error:', err);
        }
    }, [isFinished]);

    // Track per-character timing and correctness as user types
    useEffect(() => {
        if (!isFinished && localInput.length > 0) {
            if (gameStartTimeRef.current === null) {
                gameStartTimeRef.current = Date.now();
            }
            const now = Date.now();
            const elapsed = (now - gameStartTimeRef.current) / 1000;
            const idx = localInput.length - 1;
            const char = localInput[idx];
            const isCorrect = text[idx] === char;

            // Log every keypress event (not just new chars)
            setKeypressHistory(prev => [...prev, { time: elapsed, index: idx, isCorrect }]);

            setCharTimings(prev => {
                // If user backspaced, trim timings
                if (prev.length > localInput.length) {
                    return prev.slice(0, localInput.length);
                }
                // If user added a char, append
                if (prev.length < localInput.length) {
                    return [
                        ...prev,
                        { time: elapsed, isCorrect, char, index: idx }
                    ];
                }
                // If user replaced a char, update
                if (prev.length === localInput.length) {
                    const updated = [...prev];
                    updated[idx] = { time: elapsed, isCorrect, char, index: idx };
                    return updated;
                }
                return prev;
            });
        } else if (!isFinished && localInput.length === 0) {
            setCharTimings([]);
            setKeypressHistory([]);
        }
        lastInputRef.current = localInput;
    }, [localInput, isFinished, text]);

    // Reset charTimings and keypressHistory on new game
    useEffect(() => {
        setCharTimings([]);
        setKeypressHistory([]);
        gameStartTimeRef.current = null;
        setAllMistakes([]);
    }, [game]);

    // On finish, set finalCharTimings and finalKeypressHistory
    useEffect(() => {
        if (isFinished && charTimings.length > 0 && finalCharTimings.length === 0) {
            setFinalCharTimings(charTimings);
        }
        if (isFinished && keypressHistory.length > 0 && finalKeypressHistory.length === 0) {
            setFinalKeypressHistory(keypressHistory);
        }
    }, [isFinished, charTimings, finalCharTimings.length, keypressHistory, finalKeypressHistory.length]);

    const handleLogoClick = () => {
        onMainMenu();
    };

    const handlePlayAgain = () => {
        setIsFinished(false);
        setFinalStats(null);
        setFinalUserInput('');
        setWpmHistory([]);
        setCharTimings([]);
        setLocalInput('');
        gameStartTimeRef.current = null;
        onReset();
    };

    const renderText = () => {
        if (!text) return null;
        const inputChars = localInput ? localInput.split('') : [];
        // Split text into words with trailing spaces (so spaces stay with words)
        const wordRegex = /[^\s]+\s*/g;
        const wordMatches = text.match(wordRegex) || [];
        let charIndex = 0;
        return wordMatches.map((word, wIdx) => {
            const chars = [];
            for (let i = 0; i < word.length; i++) {
                const char = word[i];
                const inputChar = inputChars[charIndex];
                let className = 'neutral';
                let displayChar = char;
                if (charIndex < inputChars.length) {
                    if (inputChar === char) {
                        className = 'correct';
                    } else {
                        className = 'incorrect';
                        displayChar = inputChar; // Show the mistyped character
                    }
                }
                if (!isFinished && charIndex === localInput.length && localInput.length <= text.length) {
                    className += ' current';
                }
                chars.push(
                    <span key={`char-${charIndex}`} className={className}>{displayChar}</span>
                );
                charIndex++;
            }
            return <span key={`word-${wIdx}`}>{chars}</span>;
        });
    };

    useEffect(() => {
        const handleResize = () => setIsMobileScreen(window.innerWidth < 700);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isFinished && finalStats) {
        return (
            <EndScreen
                stats={finalStats}
                wpmHistory={wpmHistory}
                text={text}
                charTimings={finalCharTimings}
                userInput={finalUserInput}
                onPlayAgain={handlePlayAgain}
                onMainMenu={handleLogoClick}
                keypressHistory={finalKeypressHistory}
            />
        );
    }

    return (
        <TypingGameErrorBoundary>
            <div className="typing-game" style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100vh', boxSizing: 'border-box', overflow: 'hidden' }}>
                {/* Logo at top */}
                <div className="logo" onClick={handleLogoClick}>TyperPunk</div>
                {/* Main content area */}
                <div style={{
                    width: '100%',
                    flex: '1 0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    overflow: 'hidden',
                    maxHeight: 'calc(100vh - 220px)',
                    boxSizing: 'border-box',
                }}>
                    {/* Text */}
                    <div className="end-screen-text" style={{ margin: '0 auto 0.5rem auto', fontSize: '1.25rem', lineHeight: 1.7, maxWidth: 700, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                        <div className="text-display" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', width: '100%' }}>{renderText()}</div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={localInput}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            className="typing-input"
                            autoFocus
                            onBlur={(e) => {
                                if (!isFinished) {
                                    setTimeout(() => e.target.focus(), 10);
                                }
                            }}
                            disabled={isFinished}
                            style={{
                                opacity: 0,
                                caretColor: 'transparent',
                                width: '100%',
                                height: '2.5rem',
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                zIndex: 9999,
                                backgroundColor: 'transparent',
                                border: 'none',
                                outline: 'none',
                                pointerEvents: isFinished ? 'none' : 'auto'
                            }}
                        />
                    </div>
                    {attribution && (
                        <div style={{ maxWidth: 700, width: '100%', margin: '0 auto 1.5rem auto', textAlign: 'right', color: 'var(--neutral-color)', fontSize: '0.9rem' }}>
                            — {attribution}
                        </div>
                    )}
                    {/* Desktop: WPM | Graph | ACC */}
                    {!isMobileScreen && (
                      <>
                        {/* WPM far left, fixed to viewport edge */}
                        <div style={{ position: 'fixed', left: '2rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                          <div className="end-screen-stat wpm" style={{ textAlign: 'left', alignItems: 'flex-start', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                            <div className="stat-label" style={{ textAlign: 'left', width: '100%' }}>WPM</div>
                            <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'left', width: '100%' }}>{Math.round(stats.wpm)}</div>
                          </div>
                        </div>
                        {/* ACC far right, fixed to viewport edge */}
                        <div style={{ position: 'fixed', right: '2rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, minWidth: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                          <div className="end-screen-stat acc" style={{ textAlign: 'right', alignItems: 'flex-end', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
                            <div className="stat-label" style={{ textAlign: 'right', width: '100%' }}>ACC</div>
                            <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'right', width: '100%' }}>{Math.round(wasmAccuracy)}%</div>
                          </div>
                        </div>
                        {/* Graph center, take all available space with margin for stats */}
                        <div style={{ margin: '0 auto 1.5rem auto', width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                          <div className="graph-container" style={{ flex: '1 1 0', minWidth: 0, width: '100%', maxWidth: '100%', maxHeight: 220, minHeight: 220, height: 220, margin: '0 auto', position: 'relative', background: 'rgba(0,0,0,0.02)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} />
                          {/* TIME stat below graph */}
                          <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'center', width: '100%', marginTop: 12 }}>TIME</div>
                          <div className="stat-value" style={{ color: '#00ff9d', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'center', width: '100%' }}>{stats.time.toFixed(1)}</div>
                        </div>
                      </>
                    )}
                    {/* Mobile: Graph at top, then WPM & ACC in a row, then TIME below */}
                    {isMobileScreen && (
                      <>
                        <div className="graph-container" style={{ flex: 'none', minWidth: 0, width: '100%', maxWidth: '100%', maxHeight: 220, minHeight: 220, height: 220, margin: '0 auto 0.5rem auto', position: 'relative', background: 'rgba(0,0,0,0.02)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} />
                        <div className="end-screen-stats" style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            alignItems: 'center',
                            width: '100%',
                            maxWidth: 700,
                            margin: '0.5rem auto 0.2rem auto',
                            gap: '0.3rem',
                        }}>
                            {/* WPM (left) */}
                            <div className="end-screen-stat wpm" style={{ textAlign: 'left', alignItems: 'flex-start', justifyContent: 'center' }}>
                                <div className="stat-label" style={{ textAlign: 'left', width: '100%' }}>WPM</div>
                                <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'left', width: '100%' }}>{Math.round(stats.wpm)}</div>
                            </div>
                            {/* ACC (right) */}
                            <div className="end-screen-stat acc" style={{ textAlign: 'right', alignItems: 'flex-end', justifyContent: 'center' }}>
                                <div className="stat-label" style={{ textAlign: 'right', width: '100%' }}>ACC</div>
                                <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'right', width: '100%' }}>{Math.round(wasmAccuracy)}%</div>
                            </div>
                        </div>
                        {/* TIME stat below WPM/ACC */}
                        <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--neutral-color)', textAlign: 'center', width: '100%', marginTop: 8 }}>TIME</div>
                        <div className="stat-value" style={{ color: '#00ff9d', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, textAlign: 'center', width: '100%' }}>{stats.time.toFixed(1)}</div>
                      </>
                    )}
                </div>
                {/* Empty space for future game modes, matches EndScreen */}
                <div className="future-modes-placeholder" />
                <button onClick={toggleTheme} className="theme-toggle">
                    {theme === Theme.Dark ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5"/>
                            <line x1="12" y1="1" x2="12" y2="3"/>
                            <line x1="12" y1="21" x2="12" y2="23"/>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                            <line x1="1" y1="12" x2="3" y2="12"/>
                            <line x1="21" y1="12" x2="23" y2="12"/>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                        </svg>
                    )}
                </button>
            </div>
        </TypingGameErrorBoundary>
    );
}); 