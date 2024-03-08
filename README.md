# _Typerpunk_

_Typerpunk_ is a simple typing game written in Rust, where players are challenged to type sentences as quickly as possible. The game calculates the player's typing speed in Words Per Minute (WPM) and time taken.

> NOTE: Game is still in early stages of development. Plenty of features will be implemented such as programming related minigames, difficulty/custom settings and multiplayer to name a few. There are also plans to make this into not just a "cmdline" game but also have a fully fledged website and desktop gui client as well.

## Features (beta)

- Randomly selects sentences from a provided list for the player to type.
- Calculates typing speed in Words Per Minute (WPM).
- Color-coded feedback on typed characters (green for correct, red for incorrect, gray for untyped).

## Installation

To play _typerpunk_, make sure you have Rust installed on your system. You can install Rust from [rustup.rs](https://rustup.rs/).

- Can also use this to quickly download rust:

```bash
curl https://sh.rustup.rs -sSf | sh -s
```

- Clone this repository:

```bash
git clone https://github.com/srdusr/typerpunk.git
```

- Navigate to the project directory:

```bash
cd typerpunk
```

- Build and run the game:

```bash
cargo run --release
```

## How to Play

- Run the executable in the directory it's in (usually in typerpunk/target/release/):

```bash
./typerpunk
```

- Or put the executable into your path. Example:

```bash
sudo cp target/release/typerpunk /usr/local/bin
```

- Quick overview of the basics:

```
The game starts with a main menu.
Press Enter to begin.
A random sentence will be shown.
Press Enter again and type the sentence as quickly and accurately as you can.
Each correct character typed will be shown in green.
Each incorrect character typed will be shown in red.
If you make a mistake, you can use Backspace to correct it.
Press Enter when you have finished typing the sentence.
The game will display your Words Per Minute (WPM) and time taken.
To play again, press Enter at the End screen.
To quit the game, press Esc at any time.
```

## Contributing

Contributions are welcome! If you have any ideas, bug fixes, or improvements, feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
