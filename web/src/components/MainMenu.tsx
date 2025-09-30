import React, { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../types';

interface Props {
    onStartGame: () => void;
    categories?: string[];
    selectedCategory?: string;
    onSelectCategory?: (cat: string) => void;
}

const MainMenu: React.FC<Props> = ({ onStartGame, categories = [], selectedCategory = 'random', onSelectCategory }) => {
    const { theme, toggleTheme } = useTheme();
    const modes = useMemo(() => ['random', ...categories], [categories]);
    const currentIndex = Math.max(0, modes.findIndex(m => (selectedCategory || 'random') === m));
    const currentMode = modes[currentIndex] || 'random';
    const nextMode = modes[(currentIndex + 1) % modes.length] || 'random';

    return (
        <div className="main-menu">
            <h1 style={{ marginTop: '-0.25rem', marginBottom: '0.8rem' }}>TyperPunk</h1>
            <div className="menu-options" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                <button className="menu-button" onClick={onStartGame} style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Start</button>
                <button
                    className="menu-button"
                    onClick={() => onSelectCategory && onSelectCategory(nextMode)}
                    style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                    {`Mode: ${currentMode === 'random' ? 'Random' : currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}`}
                </button>
                <button className="menu-button" onClick={toggleTheme} style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Toggle Theme
                </button>
            </div>
            <button onClick={toggleTheme} className="theme-toggle" style={{ background: 'transparent', border: 'none', boxShadow: 'none', backdropFilter: 'none' }}>
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
    );
};

export default MainMenu; 