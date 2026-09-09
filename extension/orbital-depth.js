import * as THREE from './vendor/three.module.js';

// Bookmarks remain real, keyboard-accessible links. Three.js supplies depth,
// their projected positions, and halos made from each favicon's own alpha.
const canvas = document.createElement('canvas');
canvas.className = 'galaxy-canvas';
canvas.setAttribute('aria-hidden', 'true');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
} catch {
  throw new Error('WebGL unavailable; static bookmark links remain available.');
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4));
renderer.setClearColor(0x000000, 0);
document.body.prepend(canvas);

const scene = new THREE.Scene();
const cameraDistance = 2000;
const camera = new THREE.PerspectiveCamera(16, 1, .1, 6000);
camera.position.z = cameraDistance;
const system = new THREE.Group();
system.rotation.order = 'ZXY';
scene.add(system);
const orbitScales = [.57, .72, .84];
const orbitRates = [.0022, .0018, .0015, .0026, .0024, .0011];
// Bookmark speeds are independent of their assigned orbit.
const bookmarkRates = { 'amap.com': .034, 'map.baidu.com': .039, 'notion.so': .046,
  'notion.com': .046, 'chatgpt.com': .032, 'bilibili.com': .042, 'youtube.com': .036 };
function bookmarkRate(element, index) {
  const host = new URL(element.href || location.href).hostname.replace(/^www\./, '');
  return bookmarkRates[host] || .033 + (index * 7 % 13) * .001;
}
const beadRings = [5, 0, 1, 5, 2, 5, 1, 2, 5, 0, 2, 5];
const atmosphereTime = { value: 0 };
// Integer harmonics close seamlessly around the entire circumference.
const arcAlphaShader = `
  uniform float time; uniform float phase;
  varying vec2 direction;
  float arcAlpha() {
    float a = atan(direction.y, direction.x) + phase;
    float wave = .64*sin(a-time*.20) + .36*cos(3.0*a+time*.13);
    return .14 + .86*smoothstep(-.75,.85,wave);
  }
`;
// Separate orbital planes: inclination, heading, depth and parallax are all
// independent. Light grows with radius, with the outer arc as the brightest.
const orbitProfiles = [
  { tilt: 1.04, heading: .20, depth: -.040, parallax: .40, opacity: .34, glow: 1.20, width: 17, huePhase: -.18 },
  { tilt: 1.29, heading: .55, depth: .030, parallax: .85, opacity: .39, glow: 1.45, width: 21, huePhase: .22 },
  { tilt: 1.16, heading: .34, depth: -.025, parallax: 1.15, opacity: .44, glow: 1.70, width: 25, huePhase: -.30 },
  { tilt: .88, heading: .68, depth: .018, parallax: .12, opacity: .075, glow: .23, width: 7, huePhase: .32 },
  { tilt: 1.35, heading: .12, depth: -.055, parallax: .60, opacity: .10, glow: .32, width: 9, huePhase: -.12 },
  { tilt: 1.21, heading: .45, depth: .055, parallax: 1.75, opacity: .60, glow: 2.50, width: 38, huePhase: .08 }
];
const orbits = [...orbitScales, .23, .36, 1.10].map((scale, index) => {
  const profile = orbitProfiles[index];
  const plane = new THREE.Group();
  plane.rotation.order = 'ZXY';
  const geometry = new THREE.BufferGeometry();
  const arcUniforms = { time: atmosphereTime, phase: { value: index * 1.31 + profile.huePhase } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...arcUniforms, opacity: { value: profile.opacity } },
    vertexShader: `attribute vec2 arcDirection; attribute vec3 tint;
      varying vec2 direction; varying vec3 hue;
      void main(){ direction=arcDirection; hue=tint;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `${arcAlphaShader}
      uniform float opacity; varying vec3 hue;
      void main(){ gl_FragColor=vec4(hue,opacity*arcAlpha()); }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  });
  const line = new THREE.LineLoop(geometry, material);
  const glow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    uniforms: { ...arcUniforms, strength: { value: profile.glow } },
    vertexShader: `
      attribute float side; attribute vec3 tint; attribute float strandWidth; attribute float energy;
      attribute vec2 arcDirection; varying vec2 direction;
      varying float edge; varying vec3 hue; varying float filament; varying float light;
      void main(){ edge=side; hue=tint; filament=strandWidth; light=energy; direction=arcDirection;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `${arcAlphaShader}
      uniform float strength; varying float edge; varying vec3 hue; varying float filament; varying float light;
      void main(){
        float d=abs(edge); float aa=fwidth(edge)*.65;
        float core=1.0-smoothstep(filament*.35,filament+aa,d);
        float halo=exp(-d*d*4.2)*pow(max(0.0,1.0-d),1.25);
        float alpha=min((core*.56+halo*.18)*light*strength,1.0)*arcAlpha();
        vec3 color=mix(hue,vec3(.96,.97,1.0),core*.62);
        gl_FragColor=vec4(color,alpha);
      }`,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }));
  plane.add(line, glow);
  system.add(plane);
  return { scale, plane, profile, line, glow };
});

// Individual stars have actual Z positions. Camera translation therefore
// shifts nearby stars a little more than the distant field.
const starSeeds = Array.from({ length: 185 }, (_, index) => ({
  x: Math.random(), y: Math.random(), z: index % 5 === 0 ? 80 + Math.random() * 210 : -160 - Math.random() * 1400,
  size: Math.random(), alpha: Math.random(), phase: Math.random() * Math.PI * 2,
  rate: .90 + Math.random() * 1.20, drift: .45 + Math.random() * .55,
  dust: index >= 155, warm: index % 7 === 0
}));
const starGeometry = new THREE.BufferGeometry();
const starMaterial = new THREE.ShaderMaterial({
  uniforms: {
    pixelRatio: { value: renderer.getPixelRatio() }, time: atmosphereTime,
    driftAmount: { value: 1 }, twinkleDepth: { value: .94 }
  },
  vertexShader: `
    attribute float pointSize;
    attribute float brightness;
    attribute vec3 tint;
    attribute vec2 scintillation;
    attribute vec3 drift;
    attribute float dust;
    uniform float pixelRatio;
    uniform float time;
    uniform float driftAmount;
    uniform float twinkleDepth;
    varying float light;
    varying vec3 hue;
    varying float softness;
    void main() {
      float pulse = .5+.5*sin(time*scintillation.y+scintillation.x);
      float shimmer = .78+.22*sin(time*scintillation.y*.63+scintillation.x*2.7);
      float twinkle = mix(1.0,pow(pulse,1.7)*shimmer,twinkleDepth*(1.0-dust*.65));
      light = brightness*twinkle;
      hue = tint;
      softness = dust;
      vec3 p = position;
      p.xy += drift.xy * driftAmount * vec2(
        sin(time*.19+drift.z)-sin(drift.z),
        cos(time*.14+drift.z)-cos(drift.z));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = pointSize * pixelRatio * (1.0+twinkleDepth*pulse*.30);
    }
  `,
  fragmentShader: `
    varying float light;
    varying vec3 hue;
    varying float softness;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float radius = length(p);
      float core = 1.0 - smoothstep(0.035, 0.13, radius);
      float halo = exp(-radius * radius * 24.0) * .72 * (1.0-smoothstep(.40,.50,radius));
      float rays = (exp(-abs(p.x)*8.0-abs(p.y)*140.0)+exp(-abs(p.y)*14.0-abs(p.x)*160.0))*.23;
      gl_FragColor = vec4(hue, ((core + rays)*(1.0-softness) + halo) * light);
    }
  `,
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
});
const sky = new THREE.Points(starGeometry, starMaterial);
// Shader drift extends beyond the undeformed geometry bounds.
sky.frustumCulled = false;
scene.add(sky);

// Stable random seeds keep twinkles independent without per-frame allocations.
const beadSeeds = beadRings.map((ring, index) => ({
  ring, angle: index * 2.39996 + Math.random() * .4,
  rate: .035 + Math.random() * .025,
  phase: Math.random() * Math.PI * 2, twinkleRate: 1.2 + Math.random() * 1.4,
  size: (ring === 3 || ring === 4) ? 11 : 18 + Math.random() * 18,
  brightness: (ring === 3 || ring === 4) ? .38 : 1.4 + Math.random() * .85
}));
const beadGeometry = new THREE.BufferGeometry();
const beadPositions = new Float32Array(beadSeeds.length * 3);
beadGeometry.setAttribute('position', new THREE.BufferAttribute(beadPositions, 3));
beadGeometry.setAttribute('pointSize', new THREE.Float32BufferAttribute(beadSeeds.map(s => s.size), 1));
beadGeometry.setAttribute('brightness', new THREE.Float32BufferAttribute(beadSeeds.map(s => s.brightness), 1));
beadGeometry.setAttribute('scintillation', new THREE.Float32BufferAttribute(beadSeeds.flatMap(s => [s.phase, s.twinkleRate]), 2));
beadGeometry.setAttribute('drift', new THREE.Float32BufferAttribute(new Float32Array(beadSeeds.length * 3), 3));
beadGeometry.setAttribute('dust', new THREE.Float32BufferAttribute(new Float32Array(beadSeeds.length), 1));
beadGeometry.setAttribute('tint', new THREE.Float32BufferAttribute(beadSeeds.flatMap((_, i) => i % 3 ? [.70,.83,1] : [1,.83,.66]), 3));
const beadMaterial = starMaterial.clone();
beadMaterial.uniforms.time = atmosphereTime;
beadMaterial.uniforms.pixelRatio = starMaterial.uniforms.pixelRatio;
beadMaterial.uniforms.driftAmount.value = 0;
beadMaterial.uniforms.twinkleDepth.value = .96;
const beads = new THREE.Points(beadGeometry, beadMaterial);
beads.frustumCulled = false;
scene.add(beads);

// A small, genuinely three-dimensional icy nucleus grounds the orbital plane.
const nucleus = new THREE.Group();
scene.add(nucleus);
const nucleusMaterial = new THREE.ShaderMaterial({
  vertexShader: `varying vec3 surface; varying vec3 normalView;
    void main(){surface=position; normalView=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    varying vec3 surface; varying vec3 normalView;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float cloud(vec3 p){float f=0.0,a=.52;for(int i=0;i<4;i++){f+=a*noise(p);p=p*2.06+vec3(4.7,1.8,3.2);a*=.49;}return f;}
    void main(){
      vec3 n=normalize(normalView); float c=cloud(surface*4.5+vec3(0,cloud(surface*3.0)*2.0,0));
      float ribbons=sin(surface.y*18.0+c*8.0)*.5+.5;
      vec3 ice=mix(vec3(.20,.37,.58),vec3(.65,.78,.91),smoothstep(.22,.76,c));
      ice=mix(ice,vec3(.86,.88,.90),ribbons*.16);
      float diffuse=max(dot(n,normalize(vec3(-.6,.65,1.0))),0.0);
      float rim=pow(1.0-max(n.z,0.0),2.6);
      vec3 color=ice*(.52+diffuse*.65)+vec3(.59,.77,1.0)*rim*.80;
      gl_FragColor=vec4(color,1.0);
    }`
});
const nucleusBody = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), nucleusMaterial);
nucleus.add(nucleusBody);
const nucleusRing = new THREE.Mesh(new THREE.TorusGeometry(1.78, .014, 6, 128), new THREE.MeshBasicMaterial({
  color: 0xd0e0f7, transparent: true, opacity: .64, depthWrite: false
}));
nucleusRing.rotation.order = 'ZXY';
nucleusRing.rotation.set(1.19, -.12, .46);
nucleus.add(nucleusRing);
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
const glowContext = glowCanvas.getContext('2d');
if (glowContext) {
  const radial = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  radial.addColorStop(0, '#abcfffaa');radial.addColorStop(.25, '#85b9ff66');radial.addColorStop(.5, '#6aa0ee28');radial.addColorStop(1, '#6899e000');
  glowContext.fillStyle = radial;glowContext.fillRect(0, 0, 128, 128);
}
const nucleusGlowTexture = new THREE.CanvasTexture(glowCanvas);
nucleusGlowTexture.colorSpace = THREE.SRGBColorSpace;
const nucleusGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: nucleusGlowTexture, transparent: true, opacity: .72, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending }));
nucleusGlow.scale.setScalar(6.3);
nucleusGlow.position.z = -.45;
nucleus.add(nucleusGlow);

let width = 1, height = 1, worldWidth = 1, worldHeight = 1;
let radiusX = 1, radiusY = 1, elapsed = 0;
let pointerX = -10000, pointerY = -10000, targetX = 0, targetY = 0;
let frameID = 0, lastFrame = null, lost = false, stars = [];
let orbitSpeed = 1, nearestDistance = Infinity;
const projected = new THREE.Vector3();
const worldPosition = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const scaleAtDepth = z => THREE.MathUtils.clamp(cameraDistance / (cameraDistance - z), .82, 1.17);
const paused = () => document.body.classList.contains('motion-paused');

function makeHalo(star) {
  const image = star.element.querySelector('img');
  if (!image) return;
  // Remote favicon services do not consistently allow WebGL texture access.
  // Those icons keep the same alpha-following halo in CSS.
  if (new URL(image.src, location.href).origin !== location.origin) return;
  function prepare() {
    if (!image.naturalWidth || !star.element.isConnected || lost) return;
    const surface = document.createElement('canvas');
    surface.width = surface.height = 128;
    const context = surface.getContext('2d');
    if (!context) return;
    context.filter = 'blur(10px)';
    context.drawImage(image, 44, 44, 40, 40);
    context.filter = 'blur(6px)';
    context.globalAlpha = .45;
    context.drawImage(image, 44, 44, 40, 40);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, opacity: .86,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    star.halo = new THREE.Sprite(material);
    scene.add(star.halo);
    star.element.classList.add('has-webgl-halo');
    requestFrame();
  }
  if (image.complete) prepare();
  else image.addEventListener('load', prepare, { once: true });
}

function clearStars() {
  stars.forEach(star => {
    if (star.halo) {
      scene.remove(star.halo);
      star.halo.material.map.dispose();
      star.halo.material.dispose();
    }
  });
}
function refreshLinks() {
  clearStars();
  const elements = [...document.querySelectorAll('#shortcuts .shortcut')];
  const occupied = [];
  const candidate = new THREE.Vector3();
  stars = elements.map((element, index) => {
    const ring = index % 3;
    const rate = bookmarkRate(element, index);
    // Space initial positions in screen coordinates across the tilted planes.
    let start = .20, best = -1, chosenX = 0, chosenY = 0;
    for (let sample = 0; sample < (index ? 72 : 1); sample++) {
      const angle = .20 + sample / 72 * Math.PI * 2;
      candidate.set(radiusX * orbitScales[ring] * Math.cos(angle), radiusY * orbitScales[ring] * Math.sin(angle), 0)
        .applyMatrix4(orbits[ring].line.matrixWorld).project(camera);
      const x = (candidate.x * .5 + .5) * width, y = (-candidate.y * .5 + .5) * height;
      const distance = occupied.reduce((min, p) => Math.min(min, (x-p.x)**2 + (y-p.y)**2), Infinity);
      if (distance > best) { best = distance; start = angle; chosenX = x; chosenY = y; }
    }
    occupied.push({ x: chosenX, y: chosenY });
    const star = {
      element, ring, rate, angle: start - elapsed * rate,
      tile: element.querySelector('.tile'), x: -10000, y: -10000, near: false, hovered: false, halo: null,
      lastSize: null, lastOpacity: null, lastOrder: null
    };
    element.addEventListener('pointerenter', () => { star.hovered = true; requestFrame(); });
    element.addEventListener('pointerleave', () => { star.hovered = false; requestFrame(); });
    makeHalo(star);
    return star;
  });
  place();
  requestFrame();
}
function resize() {
  if (lost) return;
  width = innerWidth;
  height = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4));
  renderer.setSize(width, height, false);
  starMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * cameraDistance;
  worldWidth = worldHeight * camera.aspect;
  radiusX = Math.min(worldWidth * .35, worldHeight * .69);
  radiusY = radiusX * .8;
  system.position.set(worldWidth * .18, worldHeight * .015, 0);
  nucleus.position.copy(system.position);
  nucleus.scale.setScalar(THREE.MathUtils.clamp(width * .0135, 19, 27) * worldHeight / height);
  for (let ring = 0; ring < orbits.length; ring++) {
    const orbit = orbits[ring];
    const points = [], colors = [], ribbon = [], sides = [], tints = [], strandWidths = [], energies = [], indices = [], directions = [], ribbonDirections = [];
    const thickness = orbit.profile.width * worldHeight / height;
    for (let index = 0; index <= 320; index++) {
      const angle = index / 320 * Math.PI * 2;
      const x = radiusX * orbit.scale * Math.cos(angle), y = radiusY * orbit.scale * Math.sin(angle);
      const lightAngle = angle + orbit.profile.huePhase;
      const warm = Math.pow(Math.max(0, -Math.sin(lightAngle + .4)), 4);
      const cyan = Math.pow(Math.max(0, Math.cos(lightAngle - .55)), 8);
      const warmSheen = Math.pow(Math.max(0, Math.cos(lightAngle - 4.25)), 8);
      const blueSheen = Math.pow(Math.max(0, Math.cos(lightAngle - 1.08)), 12) * .8;
      const sheen = Math.max(warmSheen, blueSheen);
      const color = new THREE.Color(.29 + warm * .71, .53 + cyan * .22 + warm * .10, 1 - warm * .67);
      const lineColor = color.clone().lerp(new THREE.Color(.88, .94, 1), .4);
      if (index < 320) { points.push(x, y, 0); colors.push(lineColor.r, lineColor.g, lineColor.b); directions.push(Math.cos(angle), Math.sin(angle)); }
      const normal = new THREE.Vector2(Math.cos(angle) / radiusX, Math.sin(angle) / radiusY).normalize();
      for (const side of [-1, 1]) {
        ribbon.push(x + normal.x * thickness * side, y + normal.y * thickness * side, 0);
        sides.push(side);tints.push(color.r, color.g, color.b);
        ribbonDirections.push(Math.cos(angle), Math.sin(angle));
        // Widen the bloom without turning the luminous filament into a band.
        strandWidths.push((ring === 5 ? .017 : .024) + (ring === 5 ? .057 : .078) * sheen);
        energies.push(.40 + .60 * sheen);
      }
      if (index < 320) { const start = index * 2; indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2); }
    }
    orbit.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    orbit.line.geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
    orbit.line.geometry.setAttribute('arcDirection', new THREE.Float32BufferAttribute(directions, 2));
    orbit.line.geometry.computeBoundingSphere();
    orbit.glow.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
    orbit.glow.geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
    orbit.glow.geometry.setAttribute('arcDirection', new THREE.Float32BufferAttribute(ribbonDirections, 2));
    orbit.glow.geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
    orbit.glow.geometry.setAttribute('strandWidth', new THREE.Float32BufferAttribute(strandWidths, 1));
    orbit.glow.geometry.setAttribute('energy', new THREE.Float32BufferAttribute(energies, 1));
    orbit.glow.geometry.setIndex(indices);
    orbit.glow.geometry.computeBoundingSphere();
  }
  const positions = [], sizes = [], brightness = [], skyColors = [], twinkles = [], drifts = [], dust = [];
  starSeeds.forEach(seed => {
    const depth = (cameraDistance - seed.z) / cameraDistance;
    positions.push((seed.x - .5) * worldWidth * depth * 1.05, (seed.y - .5) * worldHeight * depth * 1.05, seed.z);
    sizes.push(seed.dust ? 24 + seed.size * 36 : 5 + seed.size * (seed.z > 0 ? 23 : 9));
    // Keep the reading side quieter, with a few brighter nearby stars on the right.
    const readingShade = seed.x < .38 ? .42 : 1;
    brightness.push((seed.dust ? .20 + seed.alpha * .28 : .52 + seed.alpha * (seed.z > 0 ? 1.55 : .85)) * readingShade);
    skyColors.push(...(seed.warm ? [1, .81, .65] : [.64, .79, 1]));
    twinkles.push(seed.phase, seed.rate);
    const amplitude = worldHeight * depth * (seed.z > 0 ? .20 : .11) * seed.drift;
    drifts.push(amplitude, amplitude * .6, seed.phase);
    dust.push(seed.dust ? 1 : 0);
  });
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('pointSize', new THREE.Float32BufferAttribute(sizes, 1));
  starGeometry.setAttribute('brightness', new THREE.Float32BufferAttribute(brightness, 1));
  starGeometry.setAttribute('tint', new THREE.Float32BufferAttribute(skyColors, 3));
  starGeometry.setAttribute('scintillation', new THREE.Float32BufferAttribute(twinkles, 2));
  starGeometry.setAttribute('drift', new THREE.Float32BufferAttribute(drifts, 3));
  starGeometry.setAttribute('dust', new THREE.Float32BufferAttribute(dust, 1));
  starGeometry.computeBoundingSphere();
  place();
  requestFrame();
}
function place() {
  if (lost) return;
  // Every ring moves in its own plane. Bookmarks and their halos are projected
  // through the same matrix, so depth and parallax never detach the icons.
  orbits.forEach((orbit, index) => {
    const profile = orbit.profile;
    orbit.plane.rotation.set(
      profile.tilt + Math.sin(elapsed * .009 + index * .9) * .012 + cameraPosition.y * .004 * profile.parallax,
      -.04 + Math.sin(index * 1.7) * .055,
      profile.heading + Math.sin(elapsed * .012 + index) * .016 + cameraPosition.x * .003 * profile.parallax
    );
    orbit.plane.position.set(
      -cameraPosition.x * profile.parallax,
      -cameraPosition.y * profile.parallax * .85,
      worldHeight * profile.depth
    );
    orbit.line.rotation.z = elapsed * orbitRates[index];
    orbit.glow.rotation.z = orbit.line.rotation.z;
  });
  system.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const focus = document.activeElement;
  const hasMany = stars.length > 15;
  nucleusBody.rotation.y = elapsed * .038;
  nucleusRing.rotation.z = .46 + Math.sin(elapsed * .014) * .02;
  for (let index = 0; index < beadSeeds.length; index++) {
    const seed = beadSeeds[index], orbit = orbits[seed.ring];
    // Decorative stars travel independently of the held bookmark clock.
    const angle = seed.angle + atmosphereTime.value * seed.rate;
    worldPosition.set(radiusX * orbit.scale * Math.cos(angle), radiusY * orbit.scale * Math.sin(angle), 0).applyMatrix4(orbit.line.matrixWorld);
    beadPositions[index * 3] = worldPosition.x;beadPositions[index * 3 + 1] = worldPosition.y;beadPositions[index * 3 + 2] = worldPosition.z;
  }
  beadGeometry.attributes.position.needsUpdate = true;
  nearestDistance = Infinity;
  stars.forEach(star => {
    const scale = orbitScales[star.ring];
    const angle = star.angle + elapsed * star.rate;
    worldPosition.set(radiusX * scale * Math.cos(angle), radiusY * scale * Math.sin(angle), 0).applyMatrix4(orbits[star.ring].line.matrixWorld);
    projected.copy(worldPosition).project(camera);
    star.x = (projected.x * .5 + .5) * width;
    star.y = (-projected.y * .5 + .5) * height;
    // Move the already-rasterized link layer without changing layout each frame.
    star.element.style.transform = 'translate3d(' + (star.x - 36).toFixed(3) + 'px,' + (star.y - 36).toFixed(3) + 'px,0)';
    const size = scaleAtDepth(worldPosition.z) * (hasMany ? .85 : 1);
    const sizeValue = size.toFixed(3);
    const opacity = (.86 + (size - .82) * .4).toFixed(3);
    const order = String(1000 + Math.round(worldPosition.z));
    if (sizeValue !== star.lastSize) { if (star.tile) star.tile.style.transform = 'scale(' + sizeValue + ')'; star.lastSize = sizeValue; }
    if (opacity !== star.lastOpacity) { star.element.style.opacity = opacity; star.lastOpacity = opacity; }
    if (order !== star.lastOrder) { star.element.style.zIndex = order; star.lastOrder = order; }
    const distance = Math.hypot(pointerX - star.x, pointerY - star.y);
    nearestDistance = Math.min(nearestDistance, distance);
    setNear(star, distance < 78);
    if (star.halo) {
      star.halo.position.copy(worldPosition);
      star.halo.scale.setScalar(109 * worldHeight / height * (hasMany ? .85 : 1));
      star.halo.material.opacity = star.near || focus === star.element ? 1 : .86;
    }
  });
  renderer.render(scene, camera);
}
function setNear(star, near) {
  if (star.near === near) return;
  star.near = near;
  star.element.classList.toggle('is-near', near);
}
function updateProximity() {
  nearestDistance = Infinity;
  stars.forEach(star => {
    const distance = Math.hypot(pointerX - star.x, pointerY - star.y);
    nearestDistance = Math.min(nearestDistance, distance);
    setNear(star, distance < 78);
  });
}
function frame(now) {
  frameID = 0;
  if (lost || document.hidden) return;
  const dt = lastFrame === null ? 0 : Math.min(Math.max((now - lastFrame) / 1000, 0), .05);
  lastFrame = now;
  const stopped = paused();
  // Hover holds the clickable orbit still while the surrounding sky stays alive.
  if (!stopped) atmosphereTime.value += dt;
  const targeting = stars.some(star => star.hovered || star.element === document.activeElement);
  const editing = document.body.classList.contains('editing-bookmarks') || document.querySelector('dialog[open]');
  if (stopped || targeting || editing) {
    orbitSpeed = 0;
  } else {
    // Ease down on approach, hold precisely on hover, and ease back into motion.
    const targetSpeed = THREE.MathUtils.smoothstep(nearestDistance, 42, 112);
    orbitSpeed += (targetSpeed - orbitSpeed) * (1 - Math.exp(-dt * 7));
    elapsed += dt * orbitSpeed;
    const blend = (1 - Math.exp(-dt * 2.7)) * orbitSpeed;
    cameraPosition.x += (targetX - cameraPosition.x) * blend;
    cameraPosition.y += (targetY - cameraPosition.y) * blend;
    camera.position.x = cameraPosition.x;
    camera.position.y = cameraPosition.y;
  }
  // Every display refresh updates both the projected links and WebGL together.
  place();
  if (!stopped) frameID = requestAnimationFrame(frame);
}
function requestFrame() {
  if (!frameID && !lost && !document.hidden) {
    lastFrame = null;
    frameID = requestAnimationFrame(frame);
  }
}
function recoverFallback() {
  lost = true;
  cancelAnimationFrame(frameID);
  frameID = 0;
  document.body.classList.remove('galaxy-ready');
  stars.forEach(star => {
    star.element.removeAttribute('style');
    star.tile?.style.removeProperty('transform');
    star.element.classList.remove('has-webgl-halo', 'is-near');
  });
  canvas.remove();
  clearStars();
  orbits.forEach(orbit => { orbit.line.geometry.dispose(); orbit.line.material.dispose(); orbit.glow.geometry.dispose(); orbit.glow.material.dispose(); });
  beadGeometry.dispose();beadMaterial.dispose();
  nucleusBody.geometry.dispose();nucleusMaterial.dispose();
  nucleusRing.geometry.dispose();nucleusRing.material.dispose();
  nucleusGlowTexture.dispose();nucleusGlow.material.dispose();
  starGeometry.dispose();
  starMaterial.dispose();
  renderer.dispose();
  document.dispatchEvent(new Event('orbit:fallback'));
}

document.addEventListener('pointermove', event => {
  pointerX = event.clientX;
  pointerY = event.clientY;
  targetX = (pointerX / width - .5) * 8;
  targetY = (.5 - pointerY / height) * 5;
  updateProximity();
  requestFrame();
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => {
  pointerX = pointerY = -10000;
  targetX = targetY = 0;
  updateProximity();
  requestFrame();
});
document.addEventListener('focusin', requestFrame);
document.addEventListener('focusout', requestFrame);
document.addEventListener('orbit:linkschange', () => { if (!lost) refreshLinks(); });
document.addEventListener('orbit:motionchange', requestFrame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(frameID); frameID = 0; }
  else requestFrame();
});
addEventListener('resize', resize, { passive: true });
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); recoverFallback(); });
try {
  resize();
  refreshLinks();
  document.body.classList.add('galaxy-ready');
  requestFrame();
} catch (error) {
  recoverFallback();
  throw error;
}
