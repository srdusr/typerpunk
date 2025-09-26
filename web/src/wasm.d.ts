export class TyperPunkGame {
    constructor(text: string);
    handle_input(input: string): Result<void, string>;
    handle_backspace(ctrl: boolean): Result<boolean, string>;
    get_stats(): Result<[number, number], string>;
    get_stats_and_input(): Result<[string, number, number], string>;
    is_finished(): boolean;
    can_backspace_to_position(position: number): boolean;
    get_current_word_start(): number;
    set_text(text: string): Result<void, string>;
    get_text(): string;
    get_input(): string;
    start(): void;
    get_wpm(): number;
    get_time_elapsed(): number;
    get_raw_wpm(): number;
    free(): void;
}

export type Result<T, E> = {
    isOk(): boolean;
    isErr(): boolean;
    unwrap(): T;
    unwrapErr(): E;
}; 