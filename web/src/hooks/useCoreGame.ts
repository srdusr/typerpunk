import { useEffect, useRef, useState } from 'react';
import init, { TyperPunkGame as Game } from '@typerpunk/wasm';

export function useCoreGame() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const gameRef = useRef<Game | null>(null);

    useEffect(() => {
        let mounted = true;

        const initGame = async () => {
            try {
                await init();
                if (!mounted) return;

                const game = new Game();
                gameRef.current = game;
                setIsLoading(false);
            } catch (err) {
                console.error('Failed to initialize game:', err);
                if (mounted) {
                    setError('Failed to initialize game');
                    setIsLoading(false);
                }
            }
        };

        initGame();

        return () => {
            mounted = false;
            if (gameRef.current) {
                try {
                    gameRef.current.free();
                } catch (err) {
                    console.error('Error cleaning up game:', err);
                }
                gameRef.current = null;
            }
        };
    }, []);

    const resetGame = async () => {
        if (gameRef.current) {
            try {
                gameRef.current.free();
            } catch (err) {
                console.error('Error freeing old game:', err);
            }
        }
        
        try {
            const game = new Game();
            gameRef.current = game;
        } catch (err) {
            console.error('Error resetting game:', err);
            setError('Failed to reset game');
        }
    };

    const cleanupGame = () => {
        if (gameRef.current) {
            try {
                gameRef.current.free();
            } catch (err) {
                console.error('Error cleaning up game:', err);
            }
            gameRef.current = null;
        }
    };

    return {
        game: gameRef.current,
        isLoading,
        error,
        resetGame,
        cleanupGame
    };
} 