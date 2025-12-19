# Tron Arena Lightcycle

Neon time trial racer built with Three.js.  
Ride a lightcycle in a sci fi arena, leave a glowing trail behind you, and race your own ghost to beat your best lap time.

https://github.com/your-user/your-repo   <!-- optional, remove or replace -->

---

## Features

- **Neon lightcycle with hover and lean**
  - Constant forward speed
  - Subtle hover animation and bike leaning when you steer

- **Glowing Tron style trail**
  - Custom GLSL shader with flowing energy effect
  - Trail fades away smoothly based on age
  - Colliding with your own trail counts as a crash

- **Sci fi arena**
  - Imported GLTF arena model
  - Auto computed arena bounds so you cannot drive outside the playfield
  - Rim lights around the arena for a nice silhouette

- **Lap system**
  - Invisible start gate built from track points
  - Crossing the gate going forward increments your lap
  - Lap timer and best lap tracking
  - Lap times below a minimum are ignored so accidental tiny loops are not counted

- **Ghost replay**
  - While you race, your position and rotation are sampled every few frames
  - A "best lap" ghost is saved once you set a new record
  - Ghost bike replays your best path on future laps
  - Separate neon ghost trail shows the full line of the record lap
  - Easy to change ghost color with a simple theme switch

- **Two camera modes**
  - **Chase camera** - sits behind and above the bike
  - **Cinematic camera** - slowly orbits around the front hemisphere with subtle FOV changes for a more dramatic look

- **HUD and UI**
  - Lap count
  - Speed display
  - Current lap time
  - Best lap time
  - "New Record" flash when you beat your best lap
  - Overlay messages for ready, countdown and crash states

- **Post processing**
  - UnrealBloomPass for a neon glow look
  - ACES Filmic tone mapping
  - sRGB output encoding

---

## Controls

| Key              | Action                                      |
| ---------------- | ------------------------------------------- |
| `A` or `←`       | Turn left                                   |
| `D` or `→`       | Turn right                                  |
| `Q`              | Start countdown or restart after crash      |
| `R`              | Reset to spawn and go back to ready state   |
| `C`              | Toggle free OrbitControls debug camera      |
| `V`              | Toggle Chase vs Cinematic camera mode       |
| `P`              | Log bike position to the console (debug)    |

Game states:

- **Ready**: bike is at spawn, overlay says "Press Q to start"
- **Countdown**: 3 - 2 - 1 - GO sprite appears near the gate
- **Playing**: bike moves forward, laps and trails are active
- **Crashed**: overlay tells you to press R or Q

---

## Requirements

- Node.js 18 or later
- npm or yarn
- Modern browser with WebGL support

---

## Getting started

Clone the repo and install dependencies:

```bash
git clone https://github.com/your-user/your-repo.git
cd your-repo

npm install
# or
yarn
