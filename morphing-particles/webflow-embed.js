/**
 * Morphing Particles — Webflow Embed (Get Creativ Edition)
 * Auto-initializes on any div with data-morph-particles attribute.
 * Multiple independent instances per page supported.
 *
 * Brand color attributes:
 *   data-morph-color-white="#ffffff"
 *   data-morph-color-black="#191919"
 *   data-morph-color-green="#8fff00"
 *   data-morph-color-yellow="#f5f300"
 *
 * The 3-color gradient maps to: color1 (resting) → color2 (mid) → color3 (active morph)
 * Pick any 3 of your brand colors for the gradient via:
 *   data-morph-color1  (defaults to color-black)
 *   data-morph-color2  (defaults to color-green)
 *   data-morph-color3  (defaults to color-black)
 *
 * Or use the named shortcuts directly — the system reads them in priority:
 *   1. data-morph-color1/2/3 (explicit override)
 *   2. Falls back to brand defaults
 */
(function(){'use strict';
const THREE_CDN='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
/* Brand palette */
const BRAND={white:'#ffffff',black:'#191919',green:'#8fff00',yellow:'#f5f300'};
const noiseGLSL=`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+2.0*C.xxx;vec3 x3=x0-1.0+3.0*C.xxx;
i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=1.0/7.0;vec3 ns=n_*D.wyz-D.xzx;
vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;
function poissonDisk(w,h,minD,maxD,tries,distFn){
const cs=(maxD||minD)/Math.sqrt(2),gW=Math.ceil(w/cs),gH=Math.ceil(h/cs);
const grid=new Int32Array(gW*gH).fill(-1),pts=[],act=[];
const gi=(x,y)=>Math.floor(x/cs)+Math.floor(y/cs)*gW;
function add(x,y){const i=pts.length;pts.push([x,y]);act.push(i);grid[gi(x,y)]=i;}
function near(x,y){const gx=Math.floor(x/cs),gy=Math.floor(y/cs);
for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
const nx=gx+dx,ny=gy+dy;if(nx<0||nx>=gW||ny<0||ny>=gH)continue;
const idx=grid[nx+ny*gW];if(idx===-1)continue;const p=pts[idx];
const d=Math.sqrt((p[0]-x)**2+(p[1]-y)**2);
const pd=distFn?distFn([x,y]):1;if(d<minD+(maxD-minD)*pd)return true;}return false;}
add(Math.random()*w,Math.random()*h);
while(act.length>0){const ri=Math.floor(Math.random()*act.length);
const pt=pts[act[ri]];let found=false;
for(let t=0;t<tries;t++){const a=Math.random()*Math.PI*2;
const pd=distFn?distFn(pt):1;const r=minD+(maxD-minD)*pd+Math.random()*minD;
const nx=pt[0]+Math.cos(a)*r,ny=pt[1]+Math.sin(a)*r;
if(nx>=0&&nx<w&&ny>=0&&ny<h&&!near(nx,ny)){add(nx,ny);found=true;break;}}
if(!found)act.splice(ri,1);}return pts;}
function sampleImage(ic,bp,den){const ctx=ic.getContext('2d');
const id=ctx.getImageData(0,0,500,500);
const bri=pt=>{const x=Math.round(pt[0]),y=Math.round(pt[1]);
if(x<0||x>=500||y<0||y>=500)return 1;const p=id.data[(x+y*500)*4]/255;return p*p*p;};
const maxD=(den/300)*-40+50;const sam=poissonDisk(500,500,1,Math.max(5,maxD),20,bri);
const res=new Float32Array(bp.length*2);
for(let i=0;i<bp.length;i++){const bx=bp[i][0],by=bp[i][1];
let nd=Infinity,nx=bx-250,ny=by-250;
for(let j=0;j<sam.length;j++){if(Math.random()<0.75)continue;
const sx=sam[j][0],sy=sam[j][1],dx=sx-bx,dy=sy-by,d=Math.sqrt(dx*dx+dy*dy);
if(bri(sam[j])<1&&d<nd){nd=d;nx=sx-250;ny=sy-250;}}
res[i*2]=nx;res[i*2+1]=ny;}return res;}
function loadImg(url){return new Promise((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';
img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=500;
const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,500);
const s=Math.min(500/img.width,500/img.height)*0.8;
const w=img.width*s,h=img.height*s;ctx.drawImage(img,(500-w)/2,(500-h)/2,w,h);res(c);};
img.onerror=()=>rej(new Error('Failed: '+url));img.src=url;});}
/* Resolve a color: check named brand attrs first, then direct, then default */
function resolveColor(el,num,fallback){
const direct=el.dataset['morphColor'+num];
if(direct)return direct;
/* Check if a named brand color is set */
const named=el.dataset['morphColor'+({1:'White',2:'Green',3:'Black'}[num]||'')];
if(named)return named;
return fallback;
}
async function createInstance(el,T){
const{Scene,OrthographicCamera,PerspectiveCamera,WebGLRenderer,WebGLRenderTarget,DataTexture,
RGBAFormat,FloatType,NearestFilter,RepeatWrapping,ShaderMaterial,BufferGeometry,
BufferAttribute,Points,PlaneGeometry,Mesh,Clock,Color,Vector2}=T;
const src=el.dataset.morphSrc;
/* Color resolution: named brand colors override defaults */
const cWhite=el.dataset.morphColorWhite||BRAND.white;
const cBlack=el.dataset.morphColorBlack||BRAND.black;
const cGreen=el.dataset.morphColorGreen||BRAND.green;
const cYellow=el.dataset.morphColorYellow||BRAND.yellow;
/* 3-color gradient: explicit > named > brand default */
const c1=el.dataset.morphColor1||cBlack;
const c2=el.dataset.morphColor2||cGreen;
const c3=el.dataset.morphColor3||cBlack;
const den=parseFloat(el.dataset.morphDensity||'150');
const ps=parseFloat(el.dataset.morphScale||'0.5');
const bg=el.dataset.morphBg||null;
const zm=parseFloat(el.dataset.morphZoom||'3.5');
if(!src){console.warn('[MP] No data-morph-src');return;}
let ic;try{ic=await loadImg(src);}catch(e){console.error('[MP]',e.message);return;}
const SZ=256,SZF=SZ.toFixed(1),pr=Math.min(devicePixelRatio,2);
const cv=document.createElement('canvas');
cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
el.style.position=el.style.position||'relative';el.appendChild(cv);
let W=el.offsetWidth,H=el.offsetHeight;cv.width=W;cv.height=H;
const r=new WebGLRenderer({canvas:cv,antialias:true,alpha:!bg,precision:'highp'});
r.setSize(W,H);r.setPixelRatio(pr);const sc=new Scene();if(bg)sc.background=new Color(bg);
const cam=new PerspectiveCamera(40,W/H,0.1,1000);cam.position.z=zm;const clk=new Clock();
const mD=10-den/300*8,xD=mD+1;
const bp=poissonDisk(500,500,Math.max(2,mD),Math.max(3,xD),20);
const cnt=bp.length,bf=[];for(const p of bp)bf.push(p[0]-250,p[1]-250);
const tg=sampleImage(ic,bp,den);
function mkTex(f){const d=new Float32Array(SZ*SZ*4);const n=Math.min(f.length/2,SZ*SZ);
for(let i=0;i<n;i++){d[i*4]=f[i*2]/250;d[i*4+1]=f[i*2+1]/250;}
const t=new DataTexture(d,SZ,SZ,RGBAFormat,FloatType);t.needsUpdate=true;return t;}
const pT=mkTex(bf),nT=mkTex(tg);
function mkRT(){return new WebGLRenderTarget(SZ,SZ,{wrapS:RepeatWrapping,wrapT:RepeatWrapping,
minFilter:NearestFilter,magFilter:NearestFilter,format:RGBAFormat,type:FloatType,depthBuffer:false});}
let r1=mkRT(),r2=mkRT();r.setRenderTarget(r1);r.clear();r.setRenderTarget(r2);r.clear();r.setRenderTarget(null);
const sS=new Scene(),sC=new OrthographicCamera(-1,1,1,-1,0,1);
const sM=new ShaderMaterial({uniforms:{uPosition:{value:pT},uPosRefs:{value:pT},
uPosNearest:{value:nT},uIsHovering:{value:0},uTime:{value:0},uDeltaTime:{value:0}},
vertexShader:'void main(){gl_Position=vec4(position,1.0);}',
fragmentShader:`precision highp float;
uniform sampler2D uPosition,uPosRefs,uPosNearest;uniform float uTime,uDeltaTime,uIsHovering;
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
void main(){vec2 uv=gl_FragCoord.xy/vec2(${SZF});vec4 pF=texture2D(uPosition,uv);
float scale=pF.z,vel=pF.w;vec2 ref=texture2D(uPosRefs,uv).xy,near=texture2D(uPosNearest,uv).xy;
float s=hash(uv).x,s2=hash(uv).y,time=uTime*0.5,lifeEnd=3.0+sin(s2*100.0),life=mod(s*100.0+time,lifeEnd);
vec2 pos=pF.xy,target=mix(ref,near,uIsHovering*uIsHovering);
vec2 dir=normalize(target-pos)*0.01;float dist=length(target-pos),ds=smoothstep(0.15,0.0,dist);
if(dist>0.005)pos+=dir*ds;if(life<0.01){pos=ref;pF.xy=ref;scale=0.0;}
float ts=smoothstep(0.01,0.5,life)-smoothstep(0.5,1.0,life/lifeEnd);
ts+=smoothstep(0.1,0.0,smoothstep(0.001,0.1,dist))*1.5*uIsHovering;
scale+=(ts-scale)*0.1;vec2 diff=(pos-pF.xy)*0.2;vel=smoothstep(0.15,0.001,dist)*uIsHovering;
gl_FragColor=vec4(pF.xy+diff,scale,vel);}`});
sS.add(new Mesh(new PlaneGeometry(2,2),sM));
const geo=new BufferGeometry();const uvs=new Float32Array(cnt*2),pos=new Float32Array(cnt*3);
for(let i=0;i<cnt;i++){uvs[i*2]=(i%SZ)/SZ;uvs[i*2+1]=Math.floor(i/SZ)/SZ;}
geo.setAttribute('position',new BufferAttribute(pos,3));geo.setAttribute('uv',new BufferAttribute(uvs,2));
const rM=new ShaderMaterial({uniforms:{uPosition:{value:pT},uTime:{value:0},
uColor1:{value:new Color(c1)},uColor2:{value:new Color(c2)},uColor3:{value:new Color(c3)},
uAlpha:{value:1},uIsHovering:{value:0},uPulseProgress:{value:0},
uParticleScale:{value:(W/pr/2000)*ps},uPixelRatio:{value:pr}},
vertexShader:`precision highp float;uniform sampler2D uPosition;
uniform float uTime,uParticleScale,uPixelRatio,uIsHovering,uPulseProgress;varying float vScale,vVel;
${noiseGLSL}
void main(){vec4 p=texture2D(uPosition,uv);vScale=p.z;vVel=p.w;
float nx=snoise(vec3(p.xy*10.0,uTime*0.2+100.0)),ny=snoise(vec3(p.xy*10.0,uTime*0.2));
float nx2=snoise(vec3(p.xy*0.5,uTime*0.15+45.0)),ny2=snoise(vec3(p.xy*0.5,uTime*0.15+87.0));
float d=smoothstep(0.0,0.9,p.w)*uIsHovering;p.y+=ny*0.005*d;p.x+=nx*0.005*d;
p.y+=ny2*0.02;p.x+=nx2*0.02;float cd=length(p.xy),prog=uPulseProgress;
float t=smoothstep(prog-0.25,prog,cd)-smoothstep(prog,prog+0.25,cd);t*=smoothstep(1.0,0.0,cd);
p.xy*=1.0+t*0.02;vec4 vs=modelViewMatrix*vec4(p.xy,0.0,1.0);gl_Position=projectionMatrix*vs;
gl_PointSize=((vScale*7.0)*(uPixelRatio*0.5)*uParticleScale)+(0.25*uPixelRatio);}`,
fragmentShader:`precision highp float;varying float vScale,vVel;
uniform vec3 uColor1,uColor2,uColor3;uniform float uAlpha;
void main(){vec2 uv=gl_PointCoord.xy-0.5;float h=0.8,p=vVel;
vec3 c=mix(mix(uColor1,uColor2,p/h),mix(uColor2,uColor3,(p-h)/(1.0-h)),step(h,p));
float disc=smoothstep(0.5,0.45,length(uv)),a=uAlpha*disc*smoothstep(0.1,0.2,vScale);
if(a<0.01)discard;gl_FragColor=vec4(clamp(c,0.0,1.0),clamp(a,0.0,1.0));}`,
transparent:true,depthTest:false,depthWrite:false});
const pts=new Points(geo,rM);pts.scale.set(5,-5,5);sc.add(pts);
let hP=0,hT=0,pP=0,pT2=0,lT=0,eR=false,vis=false;
el.addEventListener('mouseenter',()=>{hT=1;pP=0;pT2=1;});
el.addEventListener('mouseleave',()=>{hT=0;pP=0;pT2=1;});
new ResizeObserver(()=>{W=el.offsetWidth;H=el.offsetHeight;cv.width=W;cv.height=H;
r.setSize(W,H);cam.aspect=W/H;cam.updateProjectionMatrix();}).observe(el);
new IntersectionObserver(e=>{vis=e[0].isIntersecting;},{threshold:0}).observe(el);
function anim(){requestAnimationFrame(anim);if(!vis)return;
const t=clk.getElapsedTime(),dt=t-lT;lT=t;hP+=(hT-hP)*0.08;
if(pT2>0){pP+=dt*0.5;if(pP>=1){pP=1;pT2=0;}}
sM.uniforms.uPosition.value=eR?r1.texture:pT;sM.uniforms.uTime.value=t;
sM.uniforms.uDeltaTime.value=dt;sM.uniforms.uIsHovering.value=hP;
r.setRenderTarget(r2);r.render(sS,sC);r.setRenderTarget(null);
rM.uniforms.uPosition.value=eR?r2.texture:pT;rM.uniforms.uTime.value=t;
rM.uniforms.uIsHovering.value=hP;rM.uniforms.uPulseProgress.value=pP;
rM.uniforms.uParticleScale.value=(W/pr/2000)*ps;
r.autoClear=false;r.clear();r.render(sc,cam);
const tmp=r1;r1=r2;r2=tmp;eR=true;}anim();}
async function init(){const els=document.querySelectorAll('[data-morph-particles]');
if(els.length===0)return;const T=await import(THREE_CDN);
for(const el of els){try{await createInstance(el,T);}catch(e){console.error('[MP]',e);}}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
