/**
 * main.js — Demo entry point
 */
import { MorphingParticles } from './MorphingParticles.js';
import { generateStarTexture, generateHeartTexture, generateBoltTexture } from './generate-textures.js';

async function init() {
  const container = document.getElementById('canvas-container');
  const star = generateStarTexture();
  const heart = generateHeartTexture();
  const bolt = generateBoltTexture();
  const imageCanvases = [star, heart, bolt];

  const particles = await MorphingParticles.create(container, imageCanvases, {
    density: 150,
    particleScale: 0.5,
    cameraZoom: 3.5,
    color1: '#318bf7',
    color2: '#bada4c',
    color3: '#e35058',
    background: '#ffffff',
  });

  particles.hover();

  const buttons = document.querySelectorAll('.controls button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index, 10);
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      particles.morphTo(index);
    });
  });

  function animate() {
    requestAnimationFrame(animate);
    particles.update();
  }
  animate();

  container.addEventListener('mouseenter', () => particles.hover());
  container.addEventListener('mouseleave', () => particles.unhover());
}

init().catch(console.error);
