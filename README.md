# Flappy Wings 🐤

A tiny web-based Flappy Bird clone built with plain HTML, CSS, and JavaScript - no libraries, no build step.

## Play

**Live:** https://superagenticuser.github.io/flappy-bird/

- **Tap / click / Space** - flap your wings
- Dodge the pipes, don't touch the ground
- Medals at 10 🥉, 20 🥈, 30 🥇, 40 🏆
- Best score is saved in your browser; sound can be toggled with the 🔊 button

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## How it works

- `index.html` - page structure, start / game-over overlays
- `styles.css` - layout and panel styling
- `game.js` - canvas game loop: physics, pipe spawning, collision, parallax background, and a tiny WebAudio sound synth

Deployed with GitHub Pages from the `main` branch.
