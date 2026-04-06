/**
 * MorphingParticles — GPGPU particle system that morphs between image shapes.
 *
 * Usage:
 *   const mp = await MorphingParticles.create(container, canvases, options)
 *   mp.morphTo(0)  // morph to first image
 *   mp.hover()     // trigger hover state
 *   mp.unhover()   // release hover state
 *   mp.dispose()   // clean up
 */

import {
  Scene, OrthographicCamera, PerspectiveCamera, WebGLRenderer,
  WebGLRenderTarget, DataTexture, RGBAFormat, FloatType,
  NearestFilter, RepeatWrapping, ShaderMaterial, BufferGeometry,
  BufferAttribute, Points, PlaneGeometry, Mesh, Clock, Color,
  Vector2, Vector3, Raycaster, DoubleSide, MeshBasicMaterial,
} from 'three';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { simplexNoise3D } from './shaders/noise.glsl.js';
import { getImageData, computeNearestPoints } from './image-sampler.js';

const lerp = (x, a, b, c, d) => ((x - a) * (d - c)) / (b - a) + c;

export class MorphingParticles {
  static async create(container, imageCanvases, options = {}) {
    const instance = new MorphingParticles(container, options);
    await instance._init(imageCanvases);
    return instance;
  }

  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      density: options.density ?? 150,
      particleScale: options.particleScale ?? 0.5,
      cameraZoom: options.cameraZoom ?? 3.5,
      color1: options.color1 ?? '#318bf7',
      color2: options.color2 ?? '#bada4c',
      color3: options.color3 ?? '#e35058',
      background: options.background ?? '#ffffff',
      pixelRatio: options.pixelRatio ?? Math.min(window.devicePixelRatio, 2),
      ...options,
    };
    this.hoverProgress = 0;
    this.hoverTarget = 0;
    this.pushProgress = 0;
    this.pushTarget = 0;
    this.isIntersecting = false;
    this.intersectionPoint = new Vector3();
    this.mouse = new Vector2();
    this.clock = new Clock();
    this.lastTime = 0;
    this.everRendered = false;
    this.disposed = false;
    this.nearestPointsDataArrays = [];
    this.currentTextureIndex = 0;
  }

  async _init(imageCanvases) {
    this._setupRenderer();
    this._setupCamera();
    this._setupRaycaster();
    this._createBasePoints();
    await this._computeAllImageTargets(imageCanvases);
    this._createDataTextures();
    this._createSimulation();
    this._createRenderMesh();
    this._bindEvents();
  }

  _setupRenderer() {
    const { container, options } = this;
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.canvas.width = container.offsetWidth;
    this.canvas.height = container.offsetHeight;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance', precision: 'highp',
    });
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.renderer.setPixelRatio(options.pixelRatio);
    this.scene = new Scene();
    this.scene.background = new Color(options.background);
  }

  _setupCamera() {
    const aspect = this.canvas.width / this.canvas.height;
    this.camera = new PerspectiveCamera(40, aspect, 0.1, 1000);
    this.camera.position.z = this.options.cameraZoom;
  }

  _setupRaycaster() {
    this.raycaster = new Raycaster();
    this.raycastPlane = new Mesh(
      new PlaneGeometry(12.5, 12.5),
      new MeshBasicMaterial({ visible: false, side: DoubleSide })
    );
    this.scene.add(this.raycastPlane);
  }

  _createBasePoints() {
    const density = this.options.density;
    const minDist = lerp(density, 0, 300, 10, 2);
    const maxDist = lerp(density, 0, 300, 11, 3);
    const pds = new PoissonDiskSampling({ shape: [500, 500], minDistance: minDist, maxDistance: maxDist, tries: 20 });
    this.basePoints = pds.fill();
    this.basePointsFlat = [];
    for (const pt of this.basePoints) this.basePointsFlat.push(pt[0] - 250, pt[1] - 250);
    this.particleCount = this.basePoints.length;
    this.simSize = 256;
    this.simLength = this.simSize * this.simSize;
  }

  async _computeAllImageTargets(imageCanvases) {
    const promises = imageCanvases.map((canvas) => {
      const imgData = getImageData(canvas);
      return computeNearestPoints(imgData, this.basePoints, this.options.density);
    });
    this.nearestPointsDataArrays = await Promise.all(promises);
  }

  _createDataTextures() {
    this.positionTexture = this._createPositionTexture(this.basePointsFlat);
    this.nearestTexture = this._createPositionTexture(this.nearestPointsDataArrays[0]);
  }

  _createPositionTexture(flatData) {
    const data = new Float32Array(this.simLength * 4);
    const count = Math.min(flatData.length / 2, this.simLength);
    for (let i = 0; i < count; i++) {
      data[i * 4] = flatData[i * 2] / 250;
      data[i * 4 + 1] = flatData[i * 2 + 1] / 250;
    }
    const tex = new DataTexture(data, this.simSize, this.simSize, RGBAFormat, FloatType);
    tex.needsUpdate = true;
    return tex;
  }

  _createRenderTarget() {
    return new WebGLRenderTarget(this.simSize, this.simSize, {
      wrapS: RepeatWrapping, wrapT: RepeatWrapping,
      minFilter: NearestFilter, magFilter: NearestFilter,
      format: RGBAFormat, type: FloatType, depthBuffer: false, stencilBuffer: false,
    });
  }

  _createSimulation() {
    this.rt1 = this._createRenderTarget();
    this.rt2 = this._createRenderTarget();
    this.renderer.setRenderTarget(this.rt1); this.renderer.setClearColor(0x000000, 0); this.renderer.clear();
    this.renderer.setRenderTarget(this.rt2); this.renderer.clear();
    this.renderer.setRenderTarget(null);
    this.simScene = new Scene();
    this.simCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sz = this.simSize.toFixed(1);
    this.simMaterial = new ShaderMaterial({
      uniforms: {
        uPosition: { value: this.positionTexture }, uPosRefs: { value: this.positionTexture },
        uPosNearest: { value: this.nearestTexture }, uIsHovering: { value: 0 },
        uTime: { value: 0 }, uDeltaTime: { value: 0 },
      },
      vertexShader: `void main(){gl_Position=vec4(position,1.0);}`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uPosition, uPosRefs, uPosNearest;
        uniform float uTime, uDeltaTime, uIsHovering;
        vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
        void main(){
          vec2 uv=gl_FragCoord.xy/vec2(${sz});
          vec4 pF=texture2D(uPosition,uv);
          float scale=pF.z, vel=pF.w;
          vec2 ref=texture2D(uPosRefs,uv).xy, near=texture2D(uPosNearest,uv).xy;
          float s=hash(uv).x, s2=hash(uv).y;
          float time=uTime*0.5, lifeEnd=3.0+sin(s2*100.0), life=mod(s*100.0+time,lifeEnd);
          vec2 pos=pF.xy;
          vec2 target=mix(ref,near,uIsHovering*uIsHovering);
          vec2 dir=normalize(target-pos)*0.01;
          float dist=length(target-pos), ds=smoothstep(0.15,0.0,dist);
          if(dist>0.005) pos+=dir*ds;
          if(life<0.01){pos=ref;pF.xy=ref;scale=0.0;}
          float ts=smoothstep(0.01,0.5,life)-smoothstep(0.5,1.0,life/lifeEnd);
          ts+=smoothstep(0.1,0.0,smoothstep(0.001,0.1,dist))*1.5*uIsHovering;
          scale+=(ts-scale)*0.1;
          vec2 fp=pos, diff=(fp-pF.xy)*0.2;
          vel=smoothstep(0.15,0.001,dist)*uIsHovering;
          gl_FragColor=vec4(pF.xy+diff,scale,vel);
        }`,
    });
    this.simScene.add(new Mesh(new PlaneGeometry(2, 2), this.simMaterial));
  }

  _createRenderMesh() {
    const geo = new BufferGeometry();
    const uvs = new Float32Array(this.particleCount * 2);
    const positions = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      uvs[i * 2] = (i % this.simSize) / this.simSize;
      uvs[i * 2 + 1] = Math.floor(i / this.simSize) / this.simSize;
    }
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    const pScale = (this.canvas.width / this.options.pixelRatio / 2000) * this.options.particleScale;
    this.renderMaterial = new ShaderMaterial({
      uniforms: {
        uPosition: { value: this.positionTexture }, uTime: { value: 0 },
        uColor1: { value: new Color(this.options.color1) },
        uColor2: { value: new Color(this.options.color2) },
        uColor3: { value: new Color(this.options.color3) },
        uAlpha: { value: 1 }, uIsHovering: { value: 0 }, uPulseProgress: { value: 0 },
        uRez: { value: new Vector2(this.canvas.width, this.canvas.height) },
        uParticleScale: { value: pScale }, uPixelRatio: { value: this.options.pixelRatio },
      },
      vertexShader: `
        precision highp float;
        uniform sampler2D uPosition;
        uniform float uTime, uParticleScale, uPixelRatio, uIsHovering, uPulseProgress;
        varying float vScale, vVel;
        ${simplexNoise3D}
        void main(){
          vec4 p=texture2D(uPosition,uv);
          vScale=p.z; vVel=p.w;
          float nx=snoise(vec3(p.xy*10.0,uTime*0.2+100.0));
          float ny=snoise(vec3(p.xy*10.0,uTime*0.2));
          float nx2=snoise(vec3(p.xy*0.5,uTime*0.15+45.0));
          float ny2=snoise(vec3(p.xy*0.5,uTime*0.15+87.0));
          float d=smoothstep(0.0,0.9,p.w)*uIsHovering;
          p.y+=ny*0.005*d; p.x+=nx*0.005*d;
          p.y+=ny2*0.02; p.x+=nx2*0.02;
          float cd=length(p.xy), pr=uPulseProgress;
          float t=smoothstep(pr-0.25,pr,cd)-smoothstep(pr,pr+0.25,cd);
          t*=smoothstep(1.0,0.0,cd);
          p.xy*=1.0+t*0.02;
          vec4 vs=modelViewMatrix*vec4(p.xy,0.0,1.0);
          gl_Position=projectionMatrix*vs;
          gl_PointSize=((vScale*7.0)*(uPixelRatio*0.5)*uParticleScale)+(0.25*uPixelRatio);
        }`,
      fragmentShader: `
        precision highp float;
        varying float vScale, vVel;
        uniform vec3 uColor1, uColor2, uColor3;
        uniform float uAlpha;
        void main(){
          vec2 uv=gl_PointCoord.xy-0.5;
          float h=0.8, p=vVel;
          vec3 c=mix(mix(uColor1,uColor2,p/h),mix(uColor2,uColor3,(p-h)/(1.0-h)),step(h,p));
          float disc=smoothstep(0.5,0.45,length(uv));
          float a=uAlpha*disc*smoothstep(0.1,0.2,vScale);
          if(a<0.01)discard;
          gl_FragColor=vec4(clamp(c,0.0,1.0),clamp(a,0.0,1.0));
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.points = new Points(geo, this.renderMaterial);
    this.points.scale.set(5, -5, 5);
    this.scene.add(this.points);
  }

  _bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    this.canvas.addEventListener('mousemove', this._onMouseMove);
  }

  resize() {
    const w = this.container.offsetWidth, h = this.container.offsetHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderMaterial.uniforms.uRez.value.set(w, h);
  }

  morphTo(index) {
    if (index < 0 || index >= this.nearestPointsDataArrays.length) return;
    this.currentTextureIndex = index;
    this.nearestTexture = this._createPositionTexture(this.nearestPointsDataArrays[index]);
    this.simMaterial.uniforms.uPosNearest.value = this.nearestTexture;
    this.pushProgress = 0; this.pushTarget = 1;
  }

  hover() { this.hoverTarget = 1; this.pushProgress = 0; this.pushTarget = 1; }
  unhover() { this.hoverTarget = 0; this.pushProgress = 0; this.pushTarget = 1; }

  update() {
    if (this.disposed) return;
    const elapsed = this.clock.getElapsedTime();
    const dt = elapsed - this.lastTime; this.lastTime = elapsed;
    this.hoverProgress += (this.hoverTarget - this.hoverProgress) * 0.08;
    if (this.pushTarget > 0) { this.pushProgress += dt * 0.5; if (this.pushProgress >= 1) { this.pushProgress = 1; this.pushTarget = 0; } }
    this._updateRaycast();
    this.simMaterial.uniforms.uPosition.value = this.everRendered ? this.rt1.texture : this.positionTexture;
    this.simMaterial.uniforms.uTime.value = elapsed;
    this.simMaterial.uniforms.uDeltaTime.value = dt;
    this.simMaterial.uniforms.uIsHovering.value = this.hoverProgress;
    this.renderer.setRenderTarget(this.rt2);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);
    const pScale = (this.canvas.width / this.options.pixelRatio / 2000) * this.options.particleScale;
    this.renderMaterial.uniforms.uPosition.value = this.everRendered ? this.rt2.texture : this.positionTexture;
    this.renderMaterial.uniforms.uTime.value = elapsed;
    this.renderMaterial.uniforms.uParticleScale.value = pScale;
    this.renderMaterial.uniforms.uIsHovering.value = this.hoverProgress;
    this.renderMaterial.uniforms.uPulseProgress.value = this.pushProgress;
    this.renderer.autoClear = false; this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const temp = this.rt1; this.rt1 = this.rt2; this.rt2 = temp;
    this.everRendered = true;
  }

  _updateRaycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.raycastPlane);
    if (hits.length > 0) { this.intersectionPoint.copy(hits[0].point); this.isIntersecting = true; }
    else { this.isIntersecting = false; }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.points.geometry.dispose(); this.renderMaterial.dispose(); this.simMaterial.dispose();
    this.rt1.dispose(); this.rt2.dispose(); this.positionTexture.dispose(); this.nearestTexture.dispose();
    this.renderer.dispose();
    this.canvas.parentElement?.removeChild(this.canvas);
  }
}
