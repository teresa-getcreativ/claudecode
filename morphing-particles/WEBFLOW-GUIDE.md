# Morphing Particles — Webflow Integration Guide

## Setup (One Time)

### Step 1: Add the script

In Webflow, go to **Site Settings → Custom Code → Footer Code** and paste:

```html
<script src="https://cdn.jsdelivr.net/gh/teresa-getcreativ/claudecode@claude/rewrite-morphing-particles-ULQ3G/morphing-particles/morphing-particles.js"></script>
```

> **Note:** This is a standard `<script>` tag (not `type="module"`). The file is a self-contained IIFE that loads Three.js automatically via CDN. No build step required — works when pasted directly into Slater or Webflow custom code.

Or if you prefer to self-host, upload `morphing-particles.js` to your Webflow assets.

## Usage (Per Section)

### Step 2: Add a Div Block in Webflow Designer

1. Add a **Div Block** where you want particles
2. Size it (e.g., 100% width, 400px height)
3. Set **Position: Relative** in the Style panel
4. Add these **Custom Attributes** (Settings panel → Custom Attributes):

| Attribute | Value | Required? |
|-----------|-------|-----------|
| `data-morph-particles` | *(empty)* | ✅ Yes |
| `data-morph-src` | URL to your dark-on-white PNG | ✅ Yes |
| `data-morph-color1` | Hex color for resting state | Optional (default: `#191919`) |
| `data-morph-color2` | Hex color for active/morphed | Optional (default: `#8fff00`) |
| `data-morph-color3` | Hex color accent | Optional (default: `#191919`) |
| `data-morph-density` | Number 50–250 | Optional (default: `150`) |
| `data-morph-scale` | Particle size 0.1–2.0 | Optional (default: `0.5`) |
| `data-morph-zoom` | Camera distance 2.0–6.0 | Optional (default: `3.5`) |
| `data-morph-bg` | Background hex color | Optional (default: transparent) |

### Step 3: Prepare your images

**Rule: dark pixels = particles, white = empty space**

1. Create a PNG with your icon/logo drawn in **black on a white background**
2. Upload it to Webflow's Asset Manager
3. Copy the asset URL
4. Use it as the `data-morph-src` value

## Example: Two sections side by side (like the screenshot)

```html
<div style="display: flex; gap: 24px;">

  <!-- Section 1: Individual plan -->
  <div
    data-morph-particles
    data-morph-src="/assets/icons/individual.png"
    data-morph-color2="#4285f4"
    style="position: relative; flex: 1; height: 500px;"
  >
    <!-- Your Webflow content goes INSIDE the div -->
    <!-- The canvas renders behind it (pointer-events: none) -->
    <div style="position: relative; z-index: 1; text-align: center; padding-top: 200px;">
      <p>Available at no charge</p>
      <h2>For developers</h2>
      <a href="/download">Download</a>
    </div>
  </div>

  <!-- Section 2: Organization plan -->
  <div
    data-morph-particles
    data-morph-src="/assets/icons/cube.png"
    data-morph-color2="#34a853"
    style="position: relative; flex: 1; height: 500px;"
  >
    <div style="position: relative; z-index: 1; text-align: center; padding-top: 200px;">
      <p>Coming soon</p>
      <h2>For organizations</h2>
      <a href="/interest-form">Notify me</a>
    </div>
  </div>

</div>
```

## How it works

- The script scans the page for ALL `[data-morph-particles]` divs
- Each div gets its own independent WebGL canvas
- The canvas is positioned absolutely behind your content
- Hover over the section → particles morph into the image shape
- Mouse leave → particles scatter back (touch supported on mobile)
- Each instance only renders when scrolled into view (IntersectionObserver)
- Automatically resizes with the div (ResizeObserver)
- Particle simulation runs on the CPU — no WebGL extensions required

## Browser Compatibility

This version uses **CPU-based particle simulation** (no float textures, no render targets). It works on:

- Chrome + Apple Silicon (ANGLE/Metal) ✅
- Safari (WebKit) ✅
- Firefox ✅
- Chrome/Firefox on Windows ✅
- iOS Safari ✅ (reduced particle count)
- Android Chrome ✅ (reduced particle count)

Only basic WebGL1 is required — no `OES_texture_float` or `EXT_color_buffer_float`.

## Tips

- **Multiple instances** work fine — each is independent
- **Content goes inside** the div — set `position: relative; z-index: 1` on your content wrapper
- **Transparent background** by default — particles layer over whatever's behind
- **Performance**: each instance uses its own WebGL context. 2–3 on a page is fine, 10+ may lag on mobile
- **Mobile**: particle density is automatically capped at 80 on mobile devices for performance
- **Image tips**: simple bold shapes work best. Thin lines get lost. High contrast = better results
