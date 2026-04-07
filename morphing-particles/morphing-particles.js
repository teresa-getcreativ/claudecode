/**
 * Morphing Particles — CPU-Based Webflow Embed
 * Rewritten for broad browser compatibility (no WebGL extensions required).
 *
 * All particle simulation runs on the CPU via Float32Arrays.
 * Three.js is used for rendering only (THREE.Points draw call).
 * No render targets, no float textures, no GPGPU.
 *
 * Data attributes:
 *   data-morph-particles       — marks container
 *   data-morph-src="url"       — image URL (dark pixels on white = morph target)
 *   data-morph-color1="#hex"   — resting color (default: #191919)
 *   data-morph-color2="#hex"   — mid/velocity color (default: #8fff00)
 *   data-morph-color3="#hex"   — active morph color (default: #191919)
 *   data-morph-density="150"   — particle density 0-300 (default: 150)
 *   data-morph-scale="0.5"     — particle size multiplier (default: 0.5)
 *   data-morph-zoom="3.5"      — camera Z distance (default: 3.5)
 *   data-morph-bg="#hex"       — background color (default: transparent)
 *
 * Named brand color attributes (fallback for color1/2/3):
 *   data-morph-color-white, data-morph-color-black,
 *   data-morph-color-green, data-morph-color-yellow
 */
(function () {
  'use strict';

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.min.js';
  var BRAND = { white: '#ffffff', black: '#191919', green: '#8fff00', yellow: '#f5f300' };
  var IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var MOBILE_DENSITY_CAP = 80;

  /* ── Simplex 3D noise (JS port, Ashima Arts) ───────────────────────── */
  function _mod289(x) { return x - Math.floor(x / 289) * 289; }
  function _permute(x) { return _mod289((x * 34 + 1) * x); }

  function simplex3(x, y, z) {
    var F3 = 1 / 3, G3 = 1 / 6;
    var s = (x + y + z) * F3;
    var i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    var t = (i + j + k) * G3;
    var X0 = i - t, Y0 = j - t, Z0 = k - t;
    var x0 = x - X0, y0 = y - Y0, z0 = z - Z0;
    var i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
      else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
    }
    var x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    var x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    var x3=x0-0.5, y3=y0-0.5, z3=z0-0.5;
    i = ((i % 289) + 289) % 289;
    j = ((j % 289) + 289) % 289;
    k = ((k % 289) + 289) % 289;
    var gi0 = _permute(_permute(_permute(k) + j) + i) % 12;
    var gi1 = _permute(_permute(_permute(k + k1) + j + j1) + i + i1) % 12;
    var gi2 = _permute(_permute(_permute(k + k2) + j + j2) + i + i2) % 12;
    var gi3 = _permute(_permute(_permute(k + 1) + j + 1) + i + 1) % 12;
    var grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    function dot3(g, a, b, c) { return g[0]*a + g[1]*b + g[2]*c; }
    var n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    var t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0); }
    var t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1); }
    var t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2); }
    var t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 >= 0) { t3 *= t3; n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /* ── Poisson-disk sampling ─────────────────────────────────────────── */
  function poissonDisk(w, h, minD, maxD, tries, distFn) {
    var cs = (maxD || minD) / Math.sqrt(2);
    var gW = Math.ceil(w / cs), gH = Math.ceil(h / cs);
    var grid = new Int32Array(gW * gH);
    for (var g = 0; g < grid.length; g++) grid[g] = -1;
    var pts = [], act = [];
    function gi(x, y) { return Math.floor(x / cs) + Math.floor(y / cs) * gW; }
    function add(x, y) {
      var i = pts.length; pts.push([x, y]); act.push(i); grid[gi(x, y)] = i;
    }
    function near(x, y) {
      var gx = Math.floor(x / cs), gy = Math.floor(y / cs);
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= gW || ny < 0 || ny >= gH) continue;
        var idx = grid[nx + ny * gW]; if (idx === -1) continue;
        var p = pts[idx], ddx = p[0] - x, ddy = p[1] - y;
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        var pd = distFn ? distFn([x, y]) : 1;
        if (d < minD + (maxD - minD) * pd) return true;
      }
      return false;
    }
    add(Math.random() * w, Math.random() * h);
    while (act.length > 0) {
      var ri = Math.floor(Math.random() * act.length);
      var pt = pts[act[ri]], found = false;
      for (var tt = 0; tt < tries; tt++) {
        var a = Math.random() * Math.PI * 2;
        var pd = distFn ? distFn(pt) : 1;
        var r = minD + (maxD - minD) * pd + Math.random() * minD;
        var nx = pt[0] + Math.cos(a) * r, ny = pt[1] + Math.sin(a) * r;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !near(nx, ny)) {
          add(nx, ny); found = true; break;
        }
      }
      if (!found) act.splice(ri, 1);
    }
    return pts;
  }

  /* ── Image sampling ────────────────────────────────────────────────── */
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = c.height = 500;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 500);
        var s = Math.min(500 / img.width, 500 / img.height) * 0.8;
        var w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (500 - w) / 2, (500 - h) / 2, w, h);
        res(c);
      };
      img.onerror = function () { rej(new Error('Failed to load: ' + url)); };
      img.src = url;
    });
  }

  function sampleImage(canvas, basePts, density) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, 500, 500);
    var data = imgData.data;
    function bri(pt) {
      var x = Math.round(pt[0]), y = Math.round(pt[1]);
      if (x < 0 || x >= 500 || y < 0 || y >= 500) return 1;
      var p = data[(x + y * 500) * 4] / 255;
      return p * p * p;
    }
    var maxD = (density / 300) * -40 + 50;
    var sampled = poissonDisk(500, 500, 1, Math.max(5, maxD), 20, bri);
    var result = new Float32Array(basePts.length * 2);
    for (var i = 0; i < basePts.length; i++) {
      var bx = basePts[i][0], by = basePts[i][1];
      var nd = Infinity, nx = bx - 250, ny = by - 250;
      for (var j = 0; j < sampled.length; j++) {
        if (Math.random() < 0.75) continue;
        var sx = sampled[j][0], sy = sampled[j][1];
        var dx = sx - bx, dy = sy - by, d = Math.sqrt(dx * dx + dy * dy);
        if (bri(sampled[j]) < 1 && d < nd) { nd = d; nx = sx - 250; ny = sy - 250; }
      }
      result[i * 2] = nx; result[i * 2 + 1] = ny;
    }
    return result;
  }

  /* ── Hash function (matches GLSL version for lifecycle consistency) ── */
  function hash(a, b) {
    var p0 = a * 2127.1 + b * 81.17;
    var p1 = a * 1269.5 + b * 283.37;
    return [
      (Math.sin(p0) * 43758.5453) % 1,
      (Math.sin(p1) * 43758.5453) % 1
    ];
  }

  /* ── Instance creation ─────────────────────────────────────────────── */
  function createInstance(el) {
    var THREE = window.THREE;
    var src = el.dataset.morphSrc;
    if (!src) { console.warn('[MP] No data-morph-src on', el); return Promise.resolve(); }

    /* Resolve colors */
    var cBlack = el.dataset.morphColorBlack || BRAND.black;
    var cGreen = el.dataset.morphColorGreen || BRAND.green;
    var c1 = el.dataset.morphColor1 || cBlack;
    var c2 = el.dataset.morphColor2 || cGreen;
    var c3 = el.dataset.morphColor3 || cBlack;
    var density = parseFloat(el.dataset.morphDensity || '150');
    var pScale = parseFloat(el.dataset.morphScale || '0.5');
    var bg = el.dataset.morphBg || null;
    var zoom = parseFloat(el.dataset.morphZoom || '3.5');

    /* Reduce density on mobile */
    if (IS_MOBILE && density > MOBILE_DENSITY_CAP) density = MOBILE_DENSITY_CAP;

    return loadImg(src).then(function (imgCanvas) {
      /* ── Base points via Poisson-disk ─────────────────────────────── */
      var mD = 10 - density / 300 * 8, xD = mD + 1;
      var basePts = poissonDisk(500, 500, Math.max(2, mD), Math.max(3, xD), 20);
      var count = basePts.length;

      /* ── Sample morph targets from image ──────────────────────────── */
      var targetData = sampleImage(imgCanvas, basePts, density);

      /* ── CPU particle state arrays ────────────────────────────────── */
      var restX    = new Float32Array(count);
      var restY    = new Float32Array(count);
      var targetX  = new Float32Array(count);
      var targetY  = new Float32Array(count);
      var currentX = new Float32Array(count);
      var currentY = new Float32Array(count);
      var velMag   = new Float32Array(count);
      var scale    = new Float32Array(count);
      /* Per-particle lifecycle seeds (stable, computed once) */
      var seed1    = new Float32Array(count);
      var seed2    = new Float32Array(count);

      for (var i = 0; i < count; i++) {
        /* Rest position: base point in normalized coords (-1..1 range) */
        restX[i] = (basePts[i][0] - 250) / 250;
        restY[i] = (basePts[i][1] - 250) / 250;
        /* Target position: from image sampling */
        targetX[i] = targetData[i * 2] / 250;
        targetY[i] = targetData[i * 2 + 1] / 250;
        /* Start at rest */
        currentX[i] = restX[i];
        currentY[i] = restY[i];
        /* Lifecycle seeds (deterministic per-particle, matches GLSL hash) */
        var uv0 = (i % 256) / 256;
        var uv1 = Math.floor(i / 256) / 256;
        var h = hash(uv0, uv1);
        seed1[i] = Math.abs(h[0]);
        seed2[i] = Math.abs(h[1]);
      }

      /* ── Three.js setup (render only) ─────────────────────────────── */
      var pr = Math.min(window.devicePixelRatio || 1, 2);
      var cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      el.style.position = el.style.position || 'relative';
      el.appendChild(cv);

      var W = el.offsetWidth, H = el.offsetHeight;
      cv.width = W; cv.height = H;

      var renderer = new THREE.WebGLRenderer({
        canvas: cv, antialias: true, alpha: !bg,
        powerPreference: 'high-performance'
      });
      renderer.setSize(W, H);
      renderer.setPixelRatio(pr);

      var scene = new THREE.Scene();
      if (bg) scene.background = new THREE.Color(bg);

      var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
      camera.position.z = zoom;

      /* ── BufferGeometry with CPU-driven attributes ────────────────── */
      var geo = new THREE.BufferGeometry();
      var posArr   = new Float32Array(count * 3);
      var scaleArr = new Float32Array(count);
      var velArr   = new Float32Array(count);

      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('aScale', new THREE.BufferAttribute(scaleArr, 1));
      geo.setAttribute('aVel', new THREE.BufferAttribute(velArr, 1));

      var basePScale = (W / pr / 2000) * pScale;

      var renderMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor1: { value: new THREE.Color(c1) },
          uColor2: { value: new THREE.Color(c2) },
          uColor3: { value: new THREE.Color(c3) },
          uAlpha: { value: 1.0 },
          uParticleScale: { value: basePScale },
          uPixelRatio: { value: pr }
        },
        vertexShader: [
          'precision highp float;',
          'attribute float aScale;',
          'attribute float aVel;',
          'uniform float uParticleScale;',
          'uniform float uPixelRatio;',
          'varying float vScale;',
          'varying float vVel;',
          'void main() {',
          '  vScale = aScale;',
          '  vVel = aVel;',
          '  vec4 vs = modelViewMatrix * vec4(position, 1.0);',
          '  gl_Position = projectionMatrix * vs;',
          '  gl_PointSize = ((aScale * 7.0) * (uPixelRatio * 0.5) * uParticleScale) + (0.25 * uPixelRatio);',
          '}'
        ].join('\n'),
        fragmentShader: [
          'precision highp float;',
          'varying float vScale;',
          'varying float vVel;',
          'uniform vec3 uColor1, uColor2, uColor3;',
          'uniform float uAlpha;',
          'void main() {',
          '  vec2 uv = gl_PointCoord.xy - 0.5;',
          '  float h = 0.8;',
          '  float p = vVel;',
          '  vec3 c = mix(mix(uColor1, uColor2, p / h), mix(uColor2, uColor3, (p - h) / (1.0 - h)), step(h, p));',
          '  float disc = smoothstep(0.5, 0.45, length(uv));',
          '  float a = uAlpha * disc * smoothstep(0.1, 0.2, vScale);',
          '  if (a < 0.01) discard;',
          '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), clamp(a, 0.0, 1.0));',
          '}'
        ].join('\n'),
        transparent: true,
        depthTest: false,
        depthWrite: false
      });

      var points = new THREE.Points(geo, renderMat);
      points.scale.set(5, -5, 5);
      scene.add(points);

      /* ── State ────────────────────────────────────────────────────── */
      var hoverProgress = 0, hoverTarget = 0;
      var pushProgress = 0, pushTarget = 0;
      var visible = false, disposed = false;
      var startTime = performance.now() / 1000;
      var lastTime = 0;

      /* ── Events ───────────────────────────────────────────────────── */
      el.addEventListener('mouseenter', function () {
        hoverTarget = 1; pushProgress = 0; pushTarget = 1;
      });
      el.addEventListener('mouseleave', function () {
        hoverTarget = 0; pushProgress = 0; pushTarget = 1;
      });
      /* Touch support */
      el.addEventListener('touchstart', function () {
        hoverTarget = 1; pushProgress = 0; pushTarget = 1;
      }, { passive: true });
      el.addEventListener('touchend', function () {
        hoverTarget = 0; pushProgress = 0; pushTarget = 1;
      }, { passive: true });

      /* Resize */
      var ro = new ResizeObserver(function () {
        if (disposed) return;
        W = el.offsetWidth; H = el.offsetHeight;
        cv.width = W; cv.height = H;
        renderer.setSize(W, H);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);

      /* Visibility */
      var io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0 });
      io.observe(el);

      /* ── Smoothstep helper ────────────────────────────────────────── */
      function smoothstep(edge0, edge1, x) {
        var t = (x - edge0) / (edge1 - edge0);
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        return t * t * (3 - 2 * t);
      }

      /* ── Animation loop ───────────────────────────────────────────── */
      function animate() {
        if (disposed) return;
        requestAnimationFrame(animate);
        if (!visible) return;

        var now = performance.now() / 1000 - startTime;
        var dt = now - lastTime;
        if (dt > 0.1) dt = 0.016; /* cap delta to avoid jumps */
        lastTime = now;

        /* Ease hover progress */
        hoverProgress += (hoverTarget - hoverProgress) * 0.08;

        /* Pulse progress */
        if (pushTarget > 0) {
          pushProgress += dt * 0.5;
          if (pushProgress >= 1) { pushProgress = 1; pushTarget = 0; }
        }

        var hoverSq = hoverProgress * hoverProgress;
        var pScaleNow = (W / pr / 2000) * pScale;

        /* ── CPU particle update ──────────────────────────────────── */
        for (var idx = 0; idx < count; idx++) {
          var s1v = seed1[idx];
          var s2v = seed2[idx];

          /* Lifecycle */
          var time = now * 0.5;
          var lifeEnd = 3.0 + Math.sin(s2v * 100);
          var life = ((s1v * 100 + time) % lifeEnd + lifeEnd) % lifeEnd;

          /* Target interpolation: rest ↔ image target based on hover */
          var tx = restX[idx] + (targetX[idx] - restX[idx]) * hoverSq;
          var ty = restY[idx] + (targetY[idx] - restY[idx]) * hoverSq;

          var cx = currentX[idx], cy = currentY[idx];
          var dx = tx - cx, dy = ty - cy;
          var dist = Math.sqrt(dx * dx + dy * dy);

          /* Move toward target (matches GLSL: normalize * 0.01 * smoothstep) */
          if (dist > 0.005) {
            var ds = smoothstep(0.15, 0.0, dist);
            var invDist = 1 / dist;
            cx += dx * invDist * 0.01 * ds;
            cy += dy * invDist * 0.01 * ds;
          }

          /* Lifecycle reset */
          if (life < 0.01) {
            cx = restX[idx];
            cy = restY[idx];
            scale[idx] = 0;
          }

          /* Scale (lifecycle envelope + hover proximity boost) */
          var ts = smoothstep(0.01, 0.5, life) - smoothstep(0.5, 1.0, life / lifeEnd);
          ts += smoothstep(0.1, 0.0, smoothstep(0.001, 0.1, dist)) * 1.5 * hoverProgress;
          scale[idx] += (ts - scale[idx]) * 0.1;

          /* Velocity magnitude for color gradient */
          velMag[idx] = smoothstep(0.15, 0.001, dist) * hoverProgress;

          /* Gentle simplex noise drift for organic feel */
          var nx2 = simplex3(cx * 0.5, cy * 0.5, now * 0.15 + 45);
          var ny2 = simplex3(cx * 0.5, cy * 0.5, now * 0.15 + 87);
          cx += nx2 * 0.02;
          cy += ny2 * 0.02;

          /* Additional noise when hovering (fine detail) */
          if (hoverProgress > 0.01) {
            var d2 = smoothstep(0.0, 0.9, velMag[idx]) * hoverProgress;
            var nxf = simplex3(cx * 10, cy * 10, now * 0.2 + 100);
            var nyf = simplex3(cx * 10, cy * 10, now * 0.2);
            cx += nxf * 0.005 * d2;
            cy += nyf * 0.005 * d2;
          }

          /* Pulse effect */
          if (pushProgress > 0 && pushProgress < 1) {
            var cd = Math.sqrt(cx * cx + cy * cy);
            var pp = pushProgress;
            var pt = smoothstep(pp - 0.25, pp, cd) - smoothstep(pp, pp + 0.25, cd);
            pt *= smoothstep(1.0, 0.0, cd);
            var pulseScale = 1 + pt * 0.02;
            cx *= pulseScale;
            cy *= pulseScale;
          }

          currentX[idx] = cx;
          currentY[idx] = cy;

          /* Write to buffer attributes */
          posArr[idx * 3] = cx;
          posArr[idx * 3 + 1] = cy;
          posArr[idx * 3 + 2] = 0;
          scaleArr[idx] = scale[idx];
          velArr[idx] = velMag[idx];
        }

        /* Flag attributes for upload */
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aScale.needsUpdate = true;
        geo.attributes.aVel.needsUpdate = true;

        renderMat.uniforms.uParticleScale.value = pScaleNow;

        /* Render */
        renderer.clear();
        renderer.render(scene, camera);
      }

      requestAnimationFrame(animate);

      /* ── Cleanup handle ───────────────────────────────────────────── */
      el._mpDispose = function () {
        disposed = true;
        ro.disconnect();
        io.disconnect();
        geo.dispose();
        renderMat.dispose();
        renderer.dispose();
        if (cv.parentElement) cv.parentElement.removeChild(cv);
      };
    }).catch(function (err) {
      console.error('[MP]', err.message || err);
    });
  }

  /* ── Three.js loader + init ────────────────────────────────────────── */
  function mpRun() {
    var els = document.querySelectorAll('[data-morph-particles]');
    if (els.length === 0) return;

    var promises = [];
    for (var i = 0; i < els.length; i++) {
      promises.push(createInstance(els[i]));
    }
    Promise.all(promises).then(function () {
      console.log('[MP] All instances initialized');
    });
  }

  function boot() {
    if (window.THREE) {
      mpRun();
    } else {
      var script = document.createElement('script');
      script.src = THREE_URL;
      script.onload = mpRun;
      script.onerror = function () { console.error('[MP] Failed to load Three.js'); };
      document.head.appendChild(script);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
