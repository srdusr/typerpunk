declare module 'typerpunk' {
    export class TyperPunkGame {
        free(): void;
        set_text(text: string): void;
        get_text(): string;
        get_input(): string;
        start(): void;
        handle_input(input: string): void;
        handle_backspace(is_word_deletion: boolean): boolean;
        is_finished(): boolean;
        get_error_positions(): Uint32Array;
        get_current_streak(): number;
        get_best_streak(): number;
        get_theme(): string;
        set_theme(theme: string): void;
        get_wpm(): number;
        get_accuracy(): number;
        get_time_elapsed(): number;
        get_raw_wpm(): number;
        can_backspace(): boolean;
        can_ctrl_backspace(): boolean;
        handle_backspace(ctrl: boolean): boolean;
        get_total_mistakes(): number;
    }

    export default function init(): Promise<void>;
} 