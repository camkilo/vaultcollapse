# VaultCollapse 🔥

A fast-paced first-person 3D escape game built with Three.js. Navigate through a collapsing vault facility, collect data cores, and reach the exit portal before everything falls apart!

## 🎮 How to Play

1. Open `index.html` in a modern web browser
2. Click anywhere to start the game
3. Collect 2 data cores (glowing yellow spheres)
4. Reach the exit portal (cyan ring) before the vault collapses
5. Warning: Each core you collect increases your speed AND the collapse rate!

## 🕹️ Controls

- **Mouse**: Look around (first-person view)
- **W / Arrow Up**: Move forward (speed boost)
- **S / Arrow Down**: Move backward (slow down)
- **A / Arrow Left**: Strafe left
- **D / Arrow Right**: Strafe right
- **Space**: Jump
- **Note**: You have constant forward momentum that can be modified with W/S keys!

## ⚙️ Game Mechanics

- **Constant Forward Movement**: Your character always moves forward relative to where you're looking
- **Dynamic Gravity**: Automatically snaps to the nearest surface (floors, walls, ceilings)
- **Room Collapse**: Every 5 seconds, a random room shakes, detaches, and falls into the void
- **Progressive Difficulty**: Each data core collected increases:
  - Your movement speed by 50%
  - The room collapse rate by 1 second
- **Void Death**: Falling too far into the void ends the game

## 🏗️ Level Design

- 12 interconnected cube rooms arranged in a 3x4 grid
- Rooms connected by corridors suspended over a void
- 4 data cores placed throughout the facility
- Special rooms:
  - Start room (green tint)
  - Exit room (purple tint) with the escape portal

## 🛠️ Technical Details

- Built with Three.js (r128)
- Pure vanilla JavaScript - no build tools required
- Web-only, runs entirely in the browser
- Pointer-lock API for immersive first-person controls

## 📦 Files

- `index.html` - Main HTML structure
- `style.css` - Retro terminal-style UI
- `main.js` - Complete game logic
- `three.min.js` - Three.js library

## 🚀 Running Locally

Simply open `index.html` in a web browser, or serve via HTTP:

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server

# Then visit http://localhost:8000
```

## 🎯 Win Condition

Collect at least 2 data cores and reach the exit portal before:
- Falling into the void
- All rooms collapse
- Getting trapped in a collapsing room

Good luck, and escape before it all falls apart! 🔥  
