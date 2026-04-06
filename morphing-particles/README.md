# Morphing Particles

Standalone Three.js GPGPU particle system that morphs between image shapes.

## Quick Start (No Build Required)

1. Download `standalone.html`
2. Open it in your browser
3. Click Star / Heart / Bolt to morph between shapes

## How It Works

1. **Poisson Disk Sampling** generates evenly-distributed base particles
2. For each target image, **brightness sampling** maps dark pixels → dense particle targets
3. **GPU simulation** (FBO ping-pong) lerps particles between home and target positions
4. Rendered as `GL_POINTS` with **simplex noise** for organic movement

**Key rule:** Dark pixels in your image = particles cluster there. White = particles avoid.

## Modular Version

```bash
npm install
npm run dev
```

### Using Your Own Images

```js
import { MorphingParticles } from './src/MorphingParticles.js';
import { loadImageAsCanvas } from './src/generate-textures.js';

const logo = await loadImageAsCanvas('/my-logo.png');
const icon = await loadImageAsCanvas('/my-icon.png');

const particles = await MorphingParticles.create(container, [logo, icon], {
  density: 150,
  color1: '#318bf7',
  color2: '#bada4c',
  color3: '#e35058',
});

particles.hover();      // morph to shape
particles.morphTo(1);   // switch to icon
particles.unhover();    // scatter back
particles.dispose();    // cleanup
```

## Files

```
standalone.html              — Single-file demo (open in browser)
src/MorphingParticles.js     — Core system (GPGPU sim + rendering)
src/image-sampler.js         — Web Worker image→particle mapping
src/generate-textures.js     — Demo shapes + image loader
src/shaders/noise.glsl.js    — Simplex noise GLSL
src/main.js                  — Demo entry point
```
