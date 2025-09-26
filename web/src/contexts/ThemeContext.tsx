import React, { createContext, useContext, useState, useEffect } from 'react';
import { Theme, ThemeColors } from '../types';

interface ThemeContextType {
    theme: Theme;
    colors: ThemeColors;
    toggleTheme: () => void;
}

const lightColors: ThemeColors = {
    primary: '#00ff9d',
    secondary: '#00cc8f',
    background: '#ffffff',
    text: '#333333',
    error: '#ca4754',
    success: '#2ecc71'
};

const darkColors: ThemeColors = {
    primary: '#00ff9d',
    secondary: '#00cc8f',
    background: '#000000',
    text: '#646669',
    error: '#ef5350',
    success: '#66bb6a'
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme as Theme) || Theme.Dark;
    });

    const colors = theme === Theme.Light ? lightColors : darkColors;

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme.toLowerCase());
        if (!window.location.pathname.includes('typing-game')) {
            document.body.style.backgroundColor = theme === Theme.Light ? '#ffffff' : '#000000';
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === Theme.Light ? Theme.Dark : Theme.Light);
    };

    return (
        <ThemeContext.Provider value={{ theme, colors, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}; 