/**
 * Image Sampler — The core of the morphing system.
 *
 * For each target image, it:
 * 1. Extracts pixel brightness data from the image
 * 2. Runs Poisson Disk Sampling weighted by brightness (dark = dense)
 * 3. Maps each base particle to its nearest image-sampled point
 *
 * This runs in a Web Worker for performance.
 */

export function getImageData(canvas) {
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function computeNearestPoints(imageData, basePoints, density = 150) {
  return new Promise((resolve, reject) => {
    const workerCode = `
      self.onmessage = function(e) {
        const { imageData, pointsBase, density } = e.data;

        function poissonDiskSample(shape, minDist, maxDist, tries, distFn) {
          const width = shape[0], height = shape[1];
          const cellSize = maxDist / Math.sqrt(2);
          const gridW = Math.ceil(width / cellSize);
          const gridH = Math.ceil(height / cellSize);
          const grid = new Int32Array(gridW * gridH).fill(-1);
          const points = [];
          const active = [];

          function gridIndex(x, y) {
            return Math.floor(x / cellSize) + Math.floor(y / cellSize) * gridW;
          }

          function addPoint(x, y) {
            const i = points.length;
            points.push([x, y]);
            active.push(i);
            grid[gridIndex(x, y)] = i;
            return i;
          }

          function inNeighbourhood(x, y) {
            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nx = gx + dx, ny = gy + dy;
                if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
                const idx = grid[nx + ny * gridW];
                if (idx === -1) continue;
                const p = points[idx];
                const ddx = p[0] - x, ddy = p[1] - y;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                const pointDist = distFn ? distFn([x, y]) : 1;
                const minSpacing = minDist + (maxDist - minDist) * pointDist;
                if (dist < minSpacing) return true;
              }
            }
            return false;
          }

          addPoint(Math.random() * width, Math.random() * height);

          while (active.length > 0) {
            const randIdx = Math.floor(Math.random() * active.length);
            const pi = active[randIdx];
            const point = points[pi];
            let found = false;

            for (let t = 0; t < tries; t++) {
              const angle = Math.random() * Math.PI * 2;
              const pointDist = distFn ? distFn(point) : 1;
              const r = minDist + (maxDist - minDist) * pointDist + Math.random() * minDist;
              const nx = point[0] + Math.cos(angle) * r;
              const ny = point[1] + Math.sin(angle) * r;

              if (nx >= 0 && nx < width && ny >= 0 && ny < height && !inNeighbourhood(nx, ny)) {
                addPoint(nx, ny);
                found = true;
                break;
              }
            }

            if (!found) {
              active.splice(randIdx, 1);
            }
          }

          return points;
        }

        function brightnessDistance(point) {
          const x = Math.round(point[0]);
          const y = Math.round(point[1]);
          if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) return 1;
          const idx = (x + y * imageData.width) * 4;
          const pixel = imageData.data[idx] / 255;
          return pixel * pixel * pixel;
        }

        const linearMap = (x, a, b, c, d) => ((x - a) * (d - c)) / (b - a) + c;
        const maxDistance = linearMap(density, 0, 300, 10, 50);

        const sampledPoints = poissonDiskSample([500, 500], 1, maxDistance, 20, brightnessDistance);

        const nearestPoints = new Float32Array(pointsBase.length * 2);

        for (let i = 0; i < pointsBase.length; i++) {
          const bx = pointsBase[i][0];
          const by = pointsBase[i][1];
          let nearestDist = Infinity;
          let nearestX = bx - 250;
          let nearestY = by - 250;

          for (let j = 0; j < sampledPoints.length; j++) {
            if (Math.random() < 0.75) continue;
            const sx = sampledPoints[j][0];
            const sy = sampledPoints[j][1];
            const dx = sx - bx;
            const dy = sy - by;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const brightness = brightnessDistance(sampledPoints[j]);
            if (brightness < 1 && dist < nearestDist) {
              nearestDist = dist;
              nearestX = sx - 250;
              nearestY = sy - 250;
            }
          }

          nearestPoints[i * 2] = nearestX;
          nearestPoints[i * 2 + 1] = nearestY;
        }

        self.postMessage({ nearestPoints: nearestPoints.buffer }, [nearestPoints.buffer]);
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    worker.onmessage = (e) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(new Float32Array(e.data.nearestPoints));
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(e);
    };

    worker.postMessage({ imageData, pointsBase: basePoints, density });
  });
}
