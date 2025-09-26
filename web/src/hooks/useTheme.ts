import { useState, useEffect } from 'react';
import { Theme } from '../types';

export const useTheme = () => {
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme as Theme) || Theme.Light;
    });

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.classList.remove(Theme.Light, Theme.Dark);
        document.documentElement.classList.add(theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === Theme.Light ? Theme.Dark : Theme.Light);
    };

    return { theme, toggleTheme };
}; 