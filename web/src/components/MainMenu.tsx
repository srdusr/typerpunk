import React from 'react';
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

    return (
        <div className="main-menu">
            <h1>TyperPunk</h1>
            <div className="menu-options">
                <div style={{ marginBottom: '0.75rem' }}>
                    <label htmlFor="category" style={{ marginRight: 8 }}>Category:</label>
                    <select
                        id="category"
                        value={selectedCategory}
                        onChange={(e) => onSelectCategory && onSelectCategory(e.target.value)}
                        style={{ padding: '0.4rem 0.6rem' }}
                    >
                        <option value="random">Random</option>
                        {categories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <button className="menu-button" onClick={onStartGame}>
                    Start Typing Test
                </button>
                <button className="menu-button" onClick={toggleTheme}>
                    Toggle {theme === Theme.Dark ? 'Light' : 'Dark'} Mode
                </button>
            </div>
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
    );
};

export default MainMenu; 