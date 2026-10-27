# Rooftop Flow

A browser first-person rooftop parkour time trial built with Three.js, TypeScript, and Vite. The route crosses ten rooftops in the Azure District and includes checkpoints, sprint jumps, slide vents, a wall-run lane, vaultable obstacles, and a finish gate. All world geometry is generated in code; no external game assets are required.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in a desktop browser. Click **Start Run** to capture the mouse. Press Escape to pause and release it.

## Controls

- WASD: move
- Mouse: look
- Shift: sprint
- Space: jump (hold for a buffered/variable jump)
- Ctrl or C: slide
- E: vault an obstacle
- R: restart at the latest checkpoint
- Escape: pause

Completion time and best time are stored in local browser storage.
