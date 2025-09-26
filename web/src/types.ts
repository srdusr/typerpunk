export type Screen = 'main-menu' | 'typing-game' | 'end-screen';

export interface Stats {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  time: number;
  correctChars: number;
  incorrectChars: number;
  totalChars: number;
  currentStreak: number;
  bestStreak: number;
}

export interface GameState {
  screen: Screen;
  currentText: string;
  currentAttribution?: string;
  input: string;
  startTime: number | null;
  isRunning: boolean;
  stats: Stats;
}

export enum Theme {
    Light = 'light',
    Dark = 'dark'
}

export interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    error: string;
    success: string;
}

export interface TyperPunkGame {
    handle_input(input: string): void;
    handle_backspace(ctrl: boolean): boolean;
    get_stats(): [number, number];
    get_stats_and_input(): [string, number, number];
    is_finished(): boolean;
    get_text(): string;
    get_input(): string;
    set_text(text: string): void;
    start(): void;
    get_wpm(): number;
    get_time_elapsed(): number;
    get_raw_wpm(): number;
}

export type TyperPunk = TyperPunkGame; 