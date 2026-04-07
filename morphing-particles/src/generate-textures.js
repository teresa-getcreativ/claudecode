/**
 * Generates demo icon textures as canvas-based data URLs.
 * In production, replace these with your own PNG images.
 *
 * The morphing system reads BRIGHTNESS from images:
 * - Dark pixels = particles cluster here
 * - White pixels = particles avoid here
 */

const SIZE = 500;

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

export function generateStarTexture() {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  const cx = SIZE / 2, cy = SIZE / 2, outerR = 180, innerR = 75;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 2 * 3) + (i * Math.PI / 5);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

export function generateHeartTexture() {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  const scale = 9;
  const offsetX = SIZE / 2;
  const offsetY = SIZE / 2 + 20;
  for (let t = 0; t <= Math.PI * 2; t += 0.01) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const px = offsetX + x * scale;
    const py = offsetY + y * scale;
    t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

export function generateBoltTexture() {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  const points = [[280, 30], [150, 240], [230, 240], [180, 470], [350, 200], [260, 200], [330, 30]];
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

/**
 * Load an external image as a canvas for use with the particle system.
 * The image should have dark shapes on a white/light background.
 */
export function loadImageAsCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const scale = Math.min(SIZE / img.width, SIZE / img.height) * 0.8;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}
