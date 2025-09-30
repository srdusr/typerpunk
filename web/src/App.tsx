import { useEffect, useState } from 'react';
import { TypingGame } from './components/TypingGame';
import MainMenu from './components/MainMenu';
import { EndScreen } from './components/EndScreen';
import { GameState, Stats } from './types';
import { ThemeProvider } from './contexts/ThemeContext';
import { useCoreGame } from './hooks/useCoreGame';
import './styles.css';
import textsData from './data/texts.json';

type TextItem = { category: string; content: string; attribution: string };
const LOCAL_TEXTS: TextItem[] = Array.isArray(textsData) ? (textsData as TextItem[]) : [];
function uniqueCategories(items: TextItem[]): string[] {
    const set = new Set<string>();
    for (const t of items) if (t.category) set.add(t.category);
    return Array.from(set).sort();
}
function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomTextItemFrom(items: TextItem[], category?: string): TextItem {
    const pool = category && category !== 'random'
        ? items.filter(t => t.category === category)
        : items;
    if (!pool.length) return { category: 'general', content: "The quick brown fox jumps over the lazy dog.", attribution: 'Traditional pangram' };
    return pickRandom(pool);
}

function calculateStats(input: string, text: string, elapsedTime: number): Stats {
    let correct = 0;
    let incorrect = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    let totalErrors = 0;
    let hasStartedTyping = input.length > 0;

    // Calculate raw WPM using MonkeyType's approach
    const windowSize = 0.5; // 500ms window for more granular peak detection
    let maxWpm = 0;
    let windowChars = 0;
    let windowStartTime = 0;

    // Track character timings and errors
    const charTimings: { time: number; isCorrect: boolean }[] = [];
    for (let i = 0; i < input.length; i++) {
        const charTime = (i / input.length) * elapsedTime;
        const isCorrect = input[i] === text[i];
        charTimings.push({ time: charTime, isCorrect });
        
        // Update window
        while (charTime - windowStartTime > windowSize && charTimings.length > 0) {
            if (charTimings[0].isCorrect) {
                windowChars--;
            }
            windowStartTime = charTimings[1]?.time ?? charTime;
            charTimings.shift();
        }
        
        if (isCorrect) {
            windowChars++;
            const windowTime = charTime - windowStartTime;
            if (windowTime > 0) {
                const windowWpm = (windowChars / 5) / (windowTime / 60);
                maxWpm = Math.max(maxWpm, windowWpm);
            }
        }
    }

    const rawWpm = maxWpm; // Peak typing speed

    // Calculate other stats
    let totalTyped = 0;
    for (let i = 0; i < input.length; i++) {
        totalTyped++;
        if (i < text.length && input[i] === text[i]) {
            correct++;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
        } else {
            incorrect++;
            totalErrors++;
            currentStreak = 0;
        }
    }

    const totalChars = text.length;
    // Only show 100% accuracy before typing starts
    const accuracy = !hasStartedTyping ? 100 : Math.max(0, Math.min(100, (correct / totalTyped) * 100));
    const wpm = elapsedTime === 0 ? 0 : (correct / 5) / (elapsedTime / 60);

    return {
        wpm,
        rawWpm,
        accuracy,
        time: elapsedTime,
        correctChars: correct,
        incorrectChars: totalErrors,
        totalChars,
        currentStreak,
        bestStreak,
    };
}

export type Screen = 'main-menu' | 'typing-game' | 'end-screen';

function App() {
    const { game, resetGame, cleanupGame } = useCoreGame();
    const [allTexts, setAllTexts] = useState<TextItem[]>(LOCAL_TEXTS);
    const [categories, setCategories] = useState<string[]>(uniqueCategories(LOCAL_TEXTS));
    const [selectedCategory, setSelectedCategory] = useState<string>(() => {
        const saved = localStorage.getItem('typerpunk:last_mode');
        return saved || 'random';
    });
    const [gameState, setGameState] = useState<GameState>({
        screen: 'main-menu',
        currentText: '',
        input: '',
        startTime: null,
        isRunning: false,
        stats: {
            wpm: 0,
            rawWpm: 0,
            accuracy: 100,
            time: 0,
            correctChars: 0,
            incorrectChars: 0,
            totalChars: 0,
            currentStreak: 0,
            bestStreak: 0,
        },
    });
    const [gameKey, setGameKey] = useState<number>(0); // For remounting TypingGame
    // Track last WPM history only for end-screen payloads (retain local var at finish)
    const testStats: Stats = {
        wpm: 85, rawWpm: 90, accuracy: 95, time: 60,
        correctChars: 425, incorrectChars: 21, totalChars: 446,
        currentStreak: 50, bestStreak: 100
    };
    const testWpmHistory = Array.from({ length: 60 }, (_, i) => ({
        time: i, wpm: 80 + Math.sin(i / 5) * 10, raw: 85 + Math.sin(i / 5) * 10,
        isError: Math.random() > 0.95
    }));
    const testText = "This is a test sentence for the end screen. It has some text to display and check for errors.";
    const testUserInput = "This is a test sentance for the end screen. It has sone text to display and check for erors.";
    // removed unused _testCharTimings
    const [lastTest, setLastTest] = useState<{ stats: Stats; wpmHistory: Array<{ time: number; wpm: number; raw: number; isError: boolean }>; text: string; userInput: string; charTimings?: Array<{ time: number; isCorrect: boolean; char: string; index: number }>; keypressHistory?: Array<{ time: number; index: number; isCorrect: boolean }> } | null>(null);

    // Removed unused Enter key end-screen toggle handler

    // Optional online dataset fetch (fallback to local). Configure URL via window.TYPERPUNK_TEXTS_URL.
    useEffect(() => {
        const url = (window as any).TYPERPUNK_TEXTS_URL as string | undefined;
        if (!url) return; // no online dataset configured
        (async () => {
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data)) {
                    setAllTexts(data as TextItem[]);
                    setCategories(uniqueCategories(data as TextItem[]));
                }
            } catch {}
        })();
    }, []);

    useEffect(() => {
        try { localStorage.setItem('typerpunk:last_mode', selectedCategory); } catch {}
    }, [selectedCategory]);

    const handleStartGame = async () => {
        try {
            // Reset game state first
            const item = getRandomTextItemFrom(allTexts, selectedCategory);
            setGameState((prev: GameState) => ({
                ...prev,
                screen: 'typing-game',
                currentText: item.content,
                currentAttribution: item.attribution,
                input: '',
                startTime: null,
                isRunning: false,
                stats: {
                    wpm: 0,
                    rawWpm: 0,
                    accuracy: 100,
                    time: 0,
                    correctChars: 0,
                    incorrectChars: 0,
                    totalChars: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                },
            }));
            
            // Then reset WASM game instance
            await resetGame();
            setGameKey((k: number) => k + 1); // Force remount
            
            // Ensure focus after a short delay
            setTimeout(() => {
                const inputElement = document.querySelector('.typing-input') as HTMLInputElement;
                if (inputElement) {
                    inputElement.disabled = false;
                    inputElement.focus();
                }
            }, 200);
        } catch (err) {
            console.error('Error starting game:', err);
            // If start fails, stay in main menu
            setGameState((prev: GameState) => ({
                ...prev,
                screen: 'main-menu',
            }));
        }
    };

    const handleResetGame = async () => {
        try {
            // Reset game state first
            const item = getRandomTextItemFrom(allTexts, selectedCategory);
            setGameState((prev: GameState) => ({
                ...prev,
                screen: 'typing-game',
                currentText: item.content,
                currentAttribution: item.attribution,
                input: '',
                startTime: null,
                isRunning: false,
                stats: {
                    wpm: 0,
                    rawWpm: 0,
                    accuracy: 100,
                    time: 0,
                    correctChars: 0,
                    incorrectChars: 0,
                    totalChars: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                },
            }));
            
            // Then reset WASM game instance
            await resetGame();
            setGameKey((k: number) => k + 1); // Force remount
            
            // Ensure focus after a short delay
            setTimeout(() => {
                const inputElement = document.querySelector('.typing-input') as HTMLInputElement;
                if (inputElement) {
                    inputElement.disabled = false;
                    inputElement.focus();
                }
            }, 200);
        } catch (err) {
            console.error('Error resetting game:', err);
            // If reset fails, go back to main menu
            handleMainMenu();
        }
    };

    const handleInput = (input: string, accuracy: number, mistakes: number) => {
        setGameState((prev: GameState) => {
            // Don't update if input hasn't changed
            if (prev.input === input) {
                return prev;
            }

            const newState = {
                ...prev,
                input,
                stats: {
                    ...prev.stats,
                    accuracy,
                    incorrectChars: mistakes
                }
            };

            // Only update running state and start time once
            if (!prev.isRunning) {
                newState.isRunning = true;
                newState.startTime = Date.now();
            }

            // Check if the game is finished using WASM game's is_finished method
            if (game && game.is_finished() && prev.screen === 'typing-game') {
                newState.isRunning = false;
                newState.screen = 'end-screen';
                // Calculate final stats but preserve WASM accuracy and mistakes
                const elapsedTime = (Date.now() - (newState.startTime || Date.now())) / 1000;
                const stats = calculateStats(input, prev.currentText, elapsedTime);
                // Preserve WASM accuracy and mistakes instead of recalculating
                stats.accuracy = accuracy;
                stats.incorrectChars = mistakes;
                newState.stats = stats;
            }

            return newState;
        });
    };

    const handleFinish = (
        finalStats: Stats,
        wpmHistory: Array<{ time: number; wpm: number; raw: number; isError: boolean }>,
        userInput: string,
        charTimings: Array<{ time: number; isCorrect: boolean; char: string; index: number }>,
        keypressHistory: Array<{ time: number; index: number; isCorrect: boolean }>
    ) => {
        setLastTest({ stats: finalStats, wpmHistory, text: gameState.currentText, userInput, charTimings, keypressHistory });
        setGameState(prev => ({ ...prev, isRunning: false, screen: 'end-screen' }));
    };

    const handleMainMenu = async () => {
        try {
            // Reset game state first
            setGameState((prev: GameState) => ({
                ...prev,
                screen: 'main-menu',
                input: '',
                currentText: '',
                currentAttribution: undefined,
                startTime: null,
                isRunning: false,
                stats: {
                    wpm: 0,
                    rawWpm: 0,
                    accuracy: 100,
                    time: 0,
                    correctChars: 0,
                    incorrectChars: 0,
                    totalChars: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                },
            }));
            
            // Then cleanup WASM game instance
            cleanupGame();
            setGameKey((k: number) => k + 1); // Force remount
        } catch (err) {
            console.error('Error going to main menu:', err);
            // If cleanup fails, still try to go to main menu
            setGameState((prev: GameState) => ({
                ...prev,
                screen: 'main-menu',
                input: '',
                currentText: '',
                startTime: null,
                isRunning: false,
                stats: {
                    wpm: 0,
                    rawWpm: 0,
                    accuracy: 100,
                    time: 0,
                    correctChars: 0,
                    incorrectChars: 0,
                    totalChars: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                },
            }));
        }
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (gameState.isRunning && gameState.screen === 'typing-game' && gameState.startTime) {
            interval = setInterval(() => {
                setGameState((prev: GameState) => {
                    if (!prev.isRunning || !prev.startTime) return prev;
                    
                    const elapsedTime = (Date.now() - prev.startTime) / 1000;
                    const stats = calculateStats(prev.input, prev.currentText, elapsedTime);
                    
                    // Only update if stats have changed significantly
                    const hasSignificantChange = 
                        Math.abs(prev.stats.wpm - stats.wpm) > 0.1 ||
                        Math.abs(prev.stats.rawWpm - stats.rawWpm) > 0.1 ||
                        Math.abs(prev.stats.time - stats.time) > 0.1;
                    
                    if (!hasSignificantChange) {
                        return prev;
                    }
                    
                    return {
                        ...prev,
                        stats,
                    };
                });
            }, 100);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [gameState.isRunning, gameState.screen, gameState.startTime]);

    return (
        <ThemeProvider>
            <div className="app">
                {gameState.screen === 'main-menu' ? (
                    <MainMenu
                        onStartGame={handleStartGame}
                        categories={categories}
                        selectedCategory={selectedCategory}
                        onSelectCategory={setSelectedCategory}
                        startLabel={`Start: ${selectedCategory === 'random' ? 'Random' : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}`}
                    />
                ) : gameState.screen === 'end-screen' ? (
                    <EndScreen
                        stats={lastTest?.stats || testStats}
                        wpmHistory={lastTest?.wpmHistory || testWpmHistory}
                        text={lastTest?.text || testText}
                        userInput={lastTest?.userInput || testUserInput}
                        charTimings={lastTest?.charTimings}
                        keypressHistory={lastTest?.keypressHistory}
                        onPlayAgain={handleResetGame}
                        onMainMenu={handleMainMenu}
                    />
                ) : (
                    <TypingGame
                        key={gameKey}
                        game={game as any}
                        text={gameState.currentText}
                        input={gameState.input}
                        stats={gameState.stats}
                        attribution={gameState.currentAttribution}
                        onInput={handleInput}
                        onFinish={handleFinish}
                        onReset={handleResetGame}
                        onMainMenu={handleMainMenu}
                    />
                )}
            </div>
        </ThemeProvider>
    );
}

export default App; 