# _Typerpunk_

**_Typerpunk_** is a simple typing game written in Rust, where players are challenged to type sentences as quickly as possible. The game calculates the player's typing speed in Words Per Minute (WPM) and time taken.

> NOTE: Game is still in early stages of development. Plenty of features will be implemented such as programming related minigames, difficulty/custom settings and multiplayer to name a few. There are also plans to make this into not just a "cmdline" game but also have a fully fledged website and desktop gui client as well.

## Features (beta)

- Randomly selects sentences from a provided list for the player to type.
- Calculates typing speed in Words Per Minute (WPM).
- Color-coded feedback on typed characters (green for correct, red for incorrect, gray for untyped).

## Installation

To play **_Typerpunk_**, make sure you have Rust installed on your system. You can install Rust from [rustup.rs](https://rustup.rs/).

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

- Run the executable:

```bash
./target/release/typerpunk
```

- Or put the executable into your path. Example:

```bash
sudo cp target/release/typerpunk /usr/local/bin
```

### Gameplay:

When the game starts, you will see a main menu.  
Press `Enter` to begin the typing challenge.  
Random text will be shown and game will only start as soon as you start typing.  
Press `Enter` when you have finished typing the sentence.  
The game will display your Words Per Minute (WPM) and time taken.  
To play again, press `Enter` at the End screen.  
To quit the game, press `Esc` at any time.

### Controls:

`Enter`: Submit typed sentence or proceed in menus.  
`Backspace`: Delete the last character.  
`Esc`: Quit the game or go back to the main menu.

## Contributing

Contributions are welcome! If you have any ideas, bug fixes, or improvements, feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
