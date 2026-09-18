import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* ANALÝZA VE 3D — příběh jedné analýzy webu, řízený scrollem a fyzikou.
   Scroll NIKDY nehýbe vrstvami ani kamerou přímo: jen váží pružiny k rozložením fází.
   Vlastnictví vlastností:
     CSS        — fade canvasu, přechod titulku (opacity/transform/filter)
     rAF smyčka — vrstvy, kamera, paprsek, heatmapa, měřítka hloubky, tok lidí, popisky, graf, záře pozadí, kroky vlevo, text titulku
   Příběh (progress 0..4 přes výšku sekce):
     0.00 web klienta · 0.25 rozložení na sekce · 0.75 kolik lidí dojde ke každé sekci
     1.25 heatmapa · 1.75–2.25 tři problémy postupně se zaostřením
     2.25 recenze nahoru · 2.45 nový úvod · 2.62 kratší formulář
     3.00 složení a nové hodnoty · 3.50 výsledek za 30 dní */

const pin = document.getElementById("anPin");
const section = document.getElementById("analyza");
const canvas = document.getElementById("an3d");

if (pin && section && canvas) boot();

async function boot() {
  const params = new URLSearchParams(location.search);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("rm") === "1";
  const frozenP = params.has("p") ? parseFloat(params.get("p")) : null;
  const canHover = matchMedia("(hover: hover)").matches;
  const P_MAX = 4;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (err) {
    pin.classList.add("no-gl");
    return;
  }

  await Promise.race([
    Promise.all([
      document.fonts.load("800 60px 'Cabinet Grotesk'"),
      document.fonts.load("500 24px Switzer"),
      document.fonts.load("600 24px Switzer"),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  /* ---------- renderer, scéna, kamera ---------- */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const cam = { pos: new THREE.Vector3(0, 0.2, 12.4), vel: new THREE.Vector3(), look: new THREE.Vector3(0.4, 0, 0), lookVel: new THREE.Vector3() };
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);

  /* ---------- světla ---------- */
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x003566, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4dc, 2.2);
  key.position.set(-4, 7, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -0.0008;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc300, 2.0);
  rim.position.set(5, 3, -8);
  scene.add(rim);
  const front = new THREE.DirectionalLight(0xffffff, 0.3);
  front.position.set(0, 0, 10);
  scene.add(front);
  const side = new THREE.DirectionalLight(0x7fa7d6, 0.45);
  side.position.set(9, -2, 2);
  scene.add(side);

  /* ---------- pomocné funkce ---------- */
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const win = (a, b, c, d, x) => ss(a, b, x) * (1 - ss(c, d, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const geoms = [], mats = [], texes = [];

  const PAGE_ORIGIN = new THREE.Vector3(1.95, -0.05, 0);
  const SC = 1.02; /* měřítko celé stránky, aby se štítky vlevo nepřekrývaly s textem sekce */
  const pageQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, -0.14, 0));
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(SC).applyQuaternion(pageQuat).add(PAGE_ORIGIN);

  /* ---------- kreslení do textur ---------- */
  const PX = 520;
  const LENS_R = 0.42;
  const W = 3.4, D = 0.12, R = 0.09;
  const INK = "#F2F1EC", MUTED = "rgba(242,241,236,.6)", FAINT = "rgba(242,241,236,.16)", GOLD = "#FFC300", NAVY = "#000814";
  const H = (px) => `800 ${px}px 'Cabinet Grotesk', sans-serif`;
  const B = (px, w = 500) => `${w} ${px}px Switzer, sans-serif`;

  /* web zabírá na obrazovce ~510 px; textura má ~2× tolik pixelů (× DPR), bez mipmap,
     takže se při zmenšení text nerozmaže */
  const TEX_K = Math.min(1.3, Math.max(0.62, 0.6 * Math.min(window.devicePixelRatio || 1, 2)));
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const makeCanvas = (wu, hu) => {
    const c = document.createElement("canvas");
    c.width = Math.round(wu * PX * TEX_K);
    c.height = Math.round(hu * PX * TEX_K);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = MAX_ANISO;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    texes.push(tex);
    const g = c.getContext("2d");
    g.scale(TEX_K, TEX_K);
    return { c, g, tex, w: wu * PX, h: hu * PX };
  };
  const makeTex = (wu, hu, draw) => {
    const k = makeCanvas(wu, hu);
    draw(k.g, k.w, k.h);
    k.tex.needsUpdate = true;
    return k.tex;
  };
  const face = (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "rgba(240,232,206,.94)");
    grad.addColorStop(0.55, "rgba(228,228,224,.92)");
    grad.addColorStop(1, "rgba(204,217,234,.92)");
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, R * PX); g.fill();
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 5; g.stroke();
  };
  const pill = (g, x, y, w, h, fill, stroke) => {
    g.beginPath(); g.roundRect(x, y, w, h, h / 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
  };
  const box = (g, x, y, w, h, r, fill, stroke) => {
    g.beginPath(); g.roundRect(x, y, w, h, r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
  };
  const text = (g, str, x, y, font, color, align = "left") => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle";
    g.fillText(str, x, y);
  };

  /* obsah ukázkového webu: kuchyňské studio Nord. A = před analýzou, B = po úpravě */
  const T = "#000814", M = "rgba(0,8,20,.58)", GA = "#a67c00";
  const glassCard = (g, x, y, w, h, r) => box(g, x, y, w, h, r, "rgba(255,255,255,.62)", "rgba(255,255,255,.92)");
  const DRAW = {
    nav: (g, w, h) => {
      face(g, w, h);
      text(g, "dentalia", 60, h / 2, H(76), T);
      g.font = H(76);
      g.fillStyle = GOLD; g.beginPath(); g.arc(60 + g.measureText("dentalia").width + 16, h / 2 + 20, 11, 0, Math.PI * 2); g.fill();
      ["Ošetření", "Ceník", "Tým"].forEach((t, i) => text(g, t, 720 + i * 230, h / 2, B(48, 600), M));
      pill(g, w - 430, h / 2 - 46, 370, 92, GOLD);
      text(g, "Objednat se", w - 245, h / 2, B(46, 600), T, "center");
    },
    heroA: (g, w, h) => {
      face(g, w, h);
      text(g, "ZUBNÍ ORDINACE · PRAHA 5", 70, 78, B(40, 600), M);
      text(g, "Vítejte v naší", 62, 186, H(112), T);
      text(g, "ordinaci.", 62, 300, H(112), T);
      text(g, "Jsme tu pro vás od roku 1998.", 70, 392, B(52), M);
      text(g, "Více o nás →", w - 80, 392, B(48), "rgba(0,8,20,.4)", "right");
    },
    heroB: (g, w, h) => {
      face(g, w, h);
      text(g, "PRAHA 5 · SMÍCHOV", 70, 78, B(40, 600), M);
      text(g, "Ošetření bez bolesti", 62, 180, H(104), T);
      text(g, "a bez čekání.", 62, 290, H(104), T);
      pill(g, 70, 348, 600, 100, GOLD);
      text(g, "Objednat se online", 370, 399, B(52, 600), T, "center");
      text(g, "4,9 / 5", w - 80, 250, H(130), T, "right");
      text(g, "Google · 386 recenzí", w - 80, 340, B(44), M, "right");
    },
    services: (g, w, h) => {
      face(g, w, h);
      const cw = (w - 140 - 60) / 3;
      [["PREVENCE", "Hygiena", "Dentální hygiena", "od 1 290 Kč"], ["ESTETIKA", "Bělení", "Ordinační bělení", "od 4 900 Kč"], ["CHIRURGIE", "Implantáty", "Včetně korunky", "od 29 000 Kč"]].forEach(([k, t, d, c], i) => {
        const x = 70 + i * (cw + 30);
        glassCard(g, x, 34, cw, h - 68, 34);
        text(g, k, x + 38, 88, B(38, 600), GA);
        text(g, t, x + 38, 160, H(70), "rgba(0,8,20,.72)");
        text(g, d, x + 38, 226, B(42), M);
        text(g, c, x + 38, 296, H(54), T);
      });
    },
    formA: (g, w, h) => {
      face(g, w, h);
      text(g, "Objednávka", 70, 72, H(76), "rgba(0,8,20,.72)");
      text(g, "7 povinných polí", 510, 78, B(44), M);
      ["Jméno", "Příjmení", "Rodné č.", "Pojišťovna", "Telefon", "E-mail", "Důvod"].forEach((l, i) => {
        const x = 70 + i * 232;
        box(g, x, 142, 218, 84, 16, "rgba(255,255,255,.4)", "rgba(0,8,20,.16)");
        text(g, l, x + 16, 184, B(36), M);
      });
      pill(g, w - 300, 30, 230, 84, "rgba(0,8,20,.1)");
      text(g, "Odeslat", w - 185, 72, B(44, 600), M, "center");
    },
    formB: (g, w, h) => {
      face(g, w, h);
      text(g, "Volné termíny", 70, 72, H(76), "rgba(0,8,20,.72)");
      text(g, "tento týden", 560, 80, B(44), M);
      ["Po 14:00", "Út 9:30", "St 16:15", "Čt 8:00", "Pá 11:45"].forEach((l, i) => {
        const x = 70 + i * 262;
        if (i === 0) box(g, x, 140, 246, 88, 18, T); else box(g, x, 140, 246, 88, 18, "rgba(255,255,255,.55)", "rgba(0,8,20,.14)");
        text(g, l, x + 123, 184, B(44, 600), i === 0 ? "#FAF8F2" : "rgba(0,8,20,.7)", "center");
      });
      pill(g, w - 380, 28, 320, 88, T);
      text(g, "Rezervovat", w - 220, 72, B(46, 600), "#FAF8F2", "center");
    },
    reviews: (g, w, h) => {
      face(g, w, h);
      text(g, "Pacienti", 70, 68, H(76), T);
      [["„Poprvé jsem se nebála.“", "Tereza, Praha"], ["„Objednání za minutu.“", "Jakub, Řevnice"]].forEach(([q, a], i) => {
        const x = 70 + i * 600;
        glassCard(g, x, 120, 570, 128, 24);
        text(g, q, x + 30, 166, B(44, 600), T);
        text(g, a, x + 30, 218, B(38), M);
      });
      text(g, "4,9 / 5", w - 70, 164, H(104), T, "right");
      text(g, "386 recenzí", w - 70, 236, B(42), M, "right");
    },
    footer: (g, w, h) => {
      face(g, w, h);
      text(g, "dentalia", 60, h / 2, H(60), T);
      text(g, "Plzeňská 12 · Praha 5", w / 2, h / 2, B(46), M, "center");
      text(g, "Po–Pá 7–19", w - 60, h / 2, B(46), M, "right");
    },
  };

  /* ---------- sekce webu ---------- */
  const defs = [
    { name: "Navigace", h: 0.3, a: "nav", depthA: 100, depthB: 100, blobsA: [[0.08, 0.5, 0.09]], blobsB: [[0.08, 0.5, 0.09], [0.86, 0.5, 0.09]] },
    { name: "Úvod", h: 0.92, a: "heroA", b: "heroB", depthA: 100, depthB: 100, blobsA: [[0.2, 0.62, 0.2], [0.12, 0.18, 0.06]], blobsB: [[0.24, 0.66, 0.18], [0.18, 0.16, 0.13], [0.86, 0.52, 0.12]], anchor: [0.52, 0.62] },
    { name: "Ošetření", h: 0.7, a: "services", depthA: 64, depthB: 71, blobsA: [[0.18, 0.55, 0.13]], blobsB: [[0.18, 0.5, 0.13], [0.5, 0.5, 0.11]] },
    { name: "Objednání", h: 0.5, a: "formA", b: "formB", depthA: 38, depthB: 58, blobsA: [[0.07, 0.34, 0.07]], blobsB: [[0.12, 0.34, 0.1], [0.88, 0.82, 0.1]], anchor: [0.52, 0.34] },
    { name: "Recenze", h: 0.52, a: "reviews", depthA: 18, depthB: 86, blobsA: [[0.25, 0.46, 0.06]], blobsB: [[0.2, 0.46, 0.14], [0.54, 0.46, 0.12], [0.9, 0.52, 0.1]], anchor: [0.62, 0.5] },
    { name: "Patička", h: 0.24, a: "footer", depthA: 12, depthB: 40, blobsA: [[0.5, 0.5, 0.03]], blobsB: [[0.5, 0.5, 0.05]] },
  ];
  const ORDER_A = [0, 1, 2, 3, 4, 5];
  const ORDER_B = [0, 1, 4, 2, 3, 5]; /* recenze pod úvod */
  const stack = (order, gap) => {
    const total = defs.reduce((s, d) => s + d.h, 0) + gap * (defs.length - 1);
    const ys = new Array(defs.length);
    let cur = total / 2;
    order.forEach((i) => { ys[i] = cur - defs[i].h / 2; cur -= defs[i].h + gap; });
    return ys;
  };
  const Y_ASM = stack(ORDER_A, 0.03), Y_EXP = stack(ORDER_A, 0.2), Y_FIND = stack(ORDER_A, 0.12);
  const Y_RE = stack(ORDER_B, 0.14), Y_DONE = stack(ORDER_B, 0.03);
  const L = {
    asm: defs.map((_, i) => toWorld(0, Y_ASM[i], 0)),
    exp: defs.map((_, i) => toWorld([-0.08, 0.1, -0.1, 0.12, -0.06, 0.04][i], Y_EXP[i], [0.75, 0.45, 0.15, -0.15, -0.45, -0.75][i])),
    find: defs.map((_, i) => toWorld(0, Y_FIND[i], 0)),
    re: defs.map((_, i) => toWorld(i === 4 ? 0.6 : i === 3 ? -0.3 : 0, Y_RE[i], i === 4 ? 0.95 : i === 1 ? 0.35 : i === 3 ? 0.45 : 0)),
    done: defs.map((_, i) => toWorld(0, Y_DONE[i], 0)),
  };

  const rr = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  const plate = (w, h, d, r) => {
    const g = new THREE.ExtrudeGeometry(rr(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.016, bevelSegments: 4, curveSegments: 12 });
    g.translate(0, 0, -d / 2);
    g.computeVertexNormals();
    geoms.push(g);
    return g;
  };
  const plane = (w, h) => { const g = new THREE.PlaneGeometry(w, h); geoms.push(g); return g; };

  const glassSlab = new THREE.MeshPhysicalMaterial({
    color: 0xe6eaf0, roughness: 0.38, transmission: 0.45, thickness: 0.4, ior: 1.45,
    clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 1.1,
  });
  mats.push(glassSlab);

  /* shader čelní plochy: obsah A/B, heatmapa, ztlumení mimo zaostření, zlatá hrana, linka paprsku, zaoblení */
  const basicVert = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
  const faceFrag = `
    uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; uniform float uHeat; uniform float uHeatMix;
    uniform vec3 uBlobsA[3]; uniform vec3 uBlobsB[3]; uniform float uEdge; uniform float uDim;
    uniform float uAspect; uniform float uRadius; uniform float uScanY; uniform float uScan;
    uniform vec2 uLensC; uniform float uLensR; uniform float uLensOn;
    varying vec2 vUv;
    float heat(vec3 b[3], vec2 uv){
      float h = 0.0;
      for(int i = 0; i < 3; i++){
        vec2 d = (uv - b[i].xy) * vec2(uAspect, 1.0);
        float r = b[i].z * 1.7;
        h += 1.0 * exp(-dot(d, d) / max(r * r, 1e-4));
      }
      return h;
    }
    void main(){
      /* lupa: uvnitř kruhu se obsah zvětší 1,8× a heatmapa je vidět naplno */
      float ld = length((vUv - uLensC) * vec2(uAspect, 1.0));
      float inL = (1.0 - smoothstep(uLensR * 0.95, uLensR, ld)) * uLensOn;
      vec2 uv = mix(vUv, uLensC + (vUv - uLensC) / 1.8, inL);
      vec4 c = mix(texture2D(uA, uv), texture2D(uB, uv), uMix);
      float h = clamp(mix(heat(uBlobsA, uv), heat(uBlobsB, uv), uHeatMix), 0.0, 1.0) * clamp(uHeat + inL * 1.1, 0.0, 1.0);
      c.rgb *= 1.0 + inL * 0.1;
      vec3 ramp = h < 0.5 ? mix(vec3(0.10, 0.36, 0.72), vec3(1.0, 0.62, 0.0), h * 2.0) : mix(vec3(1.0, 0.62, 0.0), vec3(1.0, 0.93, 0.62), (h - 0.5) * 2.0);
      c.rgb = mix(c.rgb, ramp, smoothstep(0.04, 0.9, h) * 0.68);
      c.rgb = mix(c.rgb, vec3(0.02, 0.07, 0.15), 0.6 * uDim);
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      vec2 q = abs(p) - vec2(uAspect * 0.5, 0.5) + uRadius;
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
      float mask = 1.0 - smoothstep(-0.006, 0.0, d);
      float edge = exp(-abs(d) * 90.0) * uEdge;
      float line = exp(-pow((vUv.y - uScanY) * 60.0, 2.0)) * uScan;
      c.rgb += vec3(1.0, 0.78, 0.1) * (edge + line * 0.8);
      gl_FragColor = vec4(c.rgb, c.a * mask);
      #include <colorspace_fragment>
    }`;
  const toVec3 = (arr) => [0, 1, 2].map((k) => new THREE.Vector3(...(arr[k] || [0.5, 0.5, 0.0001])));

  const slabs = defs.map((d, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(plate(W, d.h, D, R), glassSlab);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const texA = makeTex(W, d.h, DRAW[d.a]);
    const texB = d.b ? makeTex(W, d.h, DRAW[d.b]) : texA;
    const fmat = new THREE.ShaderMaterial({
      vertexShader: basicVert, fragmentShader: faceFrag, transparent: true, toneMapped: false,
      uniforms: {
        uA: { value: texA }, uB: { value: texB }, uMix: { value: 0 }, uHeat: { value: 0 }, uHeatMix: { value: 0 },
        uBlobsA: { value: toVec3(d.blobsA) }, uBlobsB: { value: toVec3(d.blobsB) }, uEdge: { value: 0 }, uDim: { value: 0 },
        uAspect: { value: W / d.h }, uRadius: { value: R / d.h }, uScanY: { value: -1 }, uScan: { value: 0 },
        uLensC: { value: new THREE.Vector2(-9, -9) }, uLensR: { value: LENS_R / SC / d.h }, uLensOn: { value: 0 },
      },
    });
    mats.push(fmat);
    const facePlane = new THREE.Mesh(plane(W, d.h), fmat);
    facePlane.position.z = D / 2 + 0.02;
    group.add(facePlane);

    const frameMat = new THREE.MeshPhysicalMaterial({ color: 0xffc300, metalness: 0.7, roughness: 0.3, emissive: 0xffc300, emissiveIntensity: 0, transparent: true, opacity: 0 });
    mats.push(frameMat);
    const frame = new THREE.Mesh(plate(W + 0.06, d.h + 0.06, D * 0.5, R + 0.03), frameMat);
    frame.position.z = -0.02;
    group.add(frame);

    group.quaternion.copy(pageQuat);
    group.scale.setScalar(SC);
    scene.add(group);
    const pos = L.asm[i].clone();
    group.position.copy(pos);
    return { i, d, group, fmat, frameMat, tagKey: "", pos, vel: new THREE.Vector3(), rot: new THREE.Vector2(), period: 5 + ((i * 1.7) % 6) };
  });

  /* ---------- lupa: projíždí webem a odkrývá heatmapu ---------- */
  const lens = { pos: new THREE.Vector3(6.5, 1, 1.2), vel: new THREE.Vector3() };
  const lensGroup = new THREE.Group();
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc300, metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0x3a2a00 });
  mats.push(gold);
  const ringGeo = new THREE.TorusGeometry(LENS_R, 0.032, 24, 96);
  const handleGeo = new THREE.CylinderGeometry(0.038, 0.05, 0.62, 24);
  geoms.push(ringGeo, handleGeo);
  lensGroup.add(new THREE.Mesh(ringGeo, gold));
  const handle = new THREE.Mesh(handleGeo, gold);
  handle.position.set(Math.cos(-Math.PI / 4) * (LENS_R + 0.33), Math.sin(-Math.PI / 4) * (LENS_R + 0.33), 0);
  handle.rotation.z = Math.PI / 4;
  lensGroup.add(handle);
  const lensGlassMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: basicVert,
    fragmentShader: `uniform float uOpacity; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float d = length(p) * 2.0;
        float sheen = smoothstep(0.35, 0.0, length(p - vec2(-0.16, 0.18))) * 0.22;
        float edge = smoothstep(0.7, 1.0, d) * 0.12;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.88), (sheen + edge) * uOpacity * step(d, 1.0));
      }`,
  });
  mats.push(lensGlassMat);
  lensGroup.add(new THREE.Mesh(plane(LENS_R * 2, LENS_R * 2), lensGlassMat));
  lensGroup.traverse((o) => { o.renderOrder = 12; });
  lensGroup.scale.setScalar(0.001);
  scene.add(lensGroup);
  /* trasa lupy po webu: [sekce, u, v], cik-cak shora dolů přes místa z heatmapy */
  const LENS_PATH_UV = [[0, 0.1, 0.5], [1, 0.26, 0.66], [1, 0.8, 0.5], [2, 0.82, 0.55], [2, 0.2, 0.55], [3, 0.1, 0.4], [3, 0.8, 0.45], [4, 0.84, 0.5], [4, 0.26, 0.46], [5, 0.5, 0.5]];
  const lensCurve = new THREE.CatmullRomCurve3(LENS_PATH_UV.map(([i, u, v]) => new THREE.Vector3((u - 0.5) * W, Y_FIND[i] + (v - 0.5) * defs[i].h, D / 2 + 0.5)), false, "centripetal", 0.5);
  const lensPassT = defs.map((_, i) => LENS_PATH_UV.findIndex((q) => q[0] === i) / (LENS_PATH_UV.length - 1));
  const lensLocal = new THREE.Vector3(), lensTarget = new THREE.Vector3();
  const planeN = new THREE.Vector3(), rayDir = new THREE.Vector3(), hit = new THREE.Vector3();

  /* ---------- skenovací paprsek ---------- */
  const scanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(0xffd60a) }, uOpacity: { value: 0 } },
    vertexShader: basicVert,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        float z = vUv.y - 0.5;
        float band = exp(-pow(z * 5.0, 2.0));
        float core = exp(-pow(z * 46.0, 2.0));
        float xf = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(uColor * (0.6 + core * 0.7), (band * 0.3 + core) * xf * uOpacity);
      }`,
  });
  mats.push(scanMat);
  const scanFrame = new THREE.Group();
  scanFrame.position.copy(PAGE_ORIGIN);
  scanFrame.quaternion.copy(pageQuat);
  scanFrame.scale.setScalar(SC);
  const scan = new THREE.Mesh(plane(4.6, 2.6), scanMat);
  scan.rotation.x = -Math.PI / 2;
  scanFrame.add(scan);
  scene.add(scanFrame);

  /* ---------- tok lidí webem: jemné body shora dolů, u problémových sekcí odtékají ---------- */
  const FLOW = window.innerWidth < 768 ? 110 : 220;
  const flowPos = new Float32Array(FLOW * 3);
  const flowAlpha = new Float32Array(FLOW);
  const flowSeed = [];
  for (let k = 0; k < FLOW; k++) flowSeed.push({ t0: rand(), speed: 0.04 + rand() * 0.045, lane: (rand() * 2 - 1) * 1.45, z: 0.22 + rand() * 0.3, wob: rand() * 6.28, exit: rand() });
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute("position", new THREE.BufferAttribute(flowPos, 3));
  flowGeo.setAttribute("aAlpha", new THREE.BufferAttribute(flowAlpha, 1));
  geoms.push(flowGeo);
  const flowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    uniforms: { uPR: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(0xd49a00) } },
    vertexShader: `attribute float aAlpha; uniform float uPR; varying float vA;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 20.0 * uPR / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(uColor, a * a * vA); }`,
  });
  mats.push(flowMat);
  const flowPoints = new THREE.Points(flowGeo, flowMat);
  flowPoints.frustumCulled = false;
  scene.add(flowPoints);

  /* ---------- HTML vrstva nad scénou: štítky sekcí, nálezy, výsledek ----------
     Text je v DOM, takže je ostrý v každém rozlišení. Pozice se počítají promítnutím
     3D bodů na obrazovku a zapisují se jen přes transform a opacity. */
  const FIND = [
    { slab: 1, n: 1, big: "62 %", l1: "odejde do 10 sekund", l2: "Úvod neříká, co nabízíte.", at: [1.75, 1.92] },
    { slab: 3, n: 2, big: "9 %", l1: "dokončí objednávku", l2: "Chce 7 údajů i rodné číslo.", at: [1.92, 2.08] },
    { slab: 4, n: 3, big: "18 %", l1: "uvidí recenze", l2: "Jsou úplně dole.", at: [2.08, 2.25] },
  ];
  const ui = document.createElement("div");
  ui.className = "an-ui";
  ui.setAttribute("aria-hidden", "true");
  pin.insertBefore(ui, pin.querySelector(".an-caption"));
  const el = (cls, html, parent = ui) => { const e = document.createElement("div"); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };

  const chips = defs.map((d, i) => {
    const e = el("an-chip", `<span class="nm">${d.name}</span><span class="v"></span><i><b></b></i>`);
    return { e, v: e.querySelector(".v"), bar: e.querySelector("b"), key: "" };
  });
  const CARD_W = 206, CARD_GAP = 14;
  const findings = FIND.map((f) => {
    const line = el("an-line", "");
    const mark = el("an-mark", String(f.n));
    const card = el("an-card", `<div class="an-c-top"><span>${f.n}</span>Problém</div><div class="an-c-big">${f.big}</div><div class="an-c-l1">${f.l1}</div><div class="an-c-l2">${f.l2}</div>`);
    return { ...f, line, mark, card, anchorW: new THREE.Vector3(), ax: 0, ay: 0, cy: 0, h: 0 };
  });
  const resEl = el("an-result", `<div class="an-c-top"><span class="an-c-t">Výsledek za 30 dní</span></div>
    <div class="an-r-row"><div class="an-r-big">14</div><div class="an-r-side"><b>+193 %</b><span>dřív 14</span></div></div>
    <div class="an-r-sub">objednávek za měsíc<em>ukázková data</em></div><canvas></canvas>`);
  const resBig = resEl.querySelector(".an-r-big");
  const chartCanvas = resEl.querySelector("canvas");
  const CHART = [0.1, 0.12, 0.11, 0.14, 0.13, 0.3, 0.42, 0.5, 0.6, 0.7, 0.8, 0.92];
  let lastChart = -1;
  const drawChart = (u) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = 206, ch = 84;
    if (chartCanvas.width !== cw * dpr) { chartCanvas.width = cw * dpr; chartCanvas.height = ch * dpr; }
    const g = chartCanvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const x0 = 2, x1 = cw - 8, y0 = ch - 4, y1 = 18;
    g.strokeStyle = "rgba(242,241,236,.18)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    const n = CHART.length - 1, reach = clamp01(u) * n;
    const at = (kk) => { const i0 = Math.floor(kk), fr = kk - i0; return lerp(CHART[i0], CHART[Math.min(i0 + 1, n)], fr); };
    const mx = lerp(x0, x1, 4.5 / n);
    if (reach > 4.5) {
      g.strokeStyle = "rgba(242,241,236,.35)"; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(mx, y0); g.lineTo(mx, 6); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(242,241,236,.6)"; g.font = "600 11px Switzer, sans-serif"; g.fillText("úprava webu", mx + 5, 12);
    }
    g.beginPath();
    for (let k = 0; k <= Math.ceil(reach); k++) {
      const kk = Math.min(k, reach), x = lerp(x0, x1, kk / n), y = lerp(y0, y1, at(kk));
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = GOLD; g.lineWidth = 2.5; g.lineJoin = "round"; g.stroke();
    if (reach > 0.01) { g.fillStyle = GOLD; g.beginPath(); g.arc(lerp(x0, x1, reach / n), lerp(y0, y1, at(reach)), 4, 0, Math.PI * 2); g.fill(); }
  };
  drawChart(0);
  const view = { w: 1440, h: 900 };
  const proj = new THREE.Vector3();
  const toScreen = (v) => {
    proj.copy(v).project(camera);
    return [(proj.x + 1) / 2 * view.w, (1 - proj.y) / 2 * view.h];
  };

  /* ---------- titulek: co se právě děje ---------- */
  const capEl = pin.querySelector(".an-caption");
  const capK = capEl && capEl.querySelector(".k");
  const capS = capEl && capEl.querySelector(".s");
  const BEATS = [
    [0.0, "01 · Projdeme", "Tohle je web zubní kliniky. Vypadá dobře, ale pacienti se objednávají málo."],
    [0.25, "01 · Projdeme", "Rozložíme ho na jednotlivé sekce."],
    [0.75, "01 · Projdeme", "U každé sekce změříme, kolik lidí k ní vůbec doscrolluje."],
    [1.25, "02 · Najdeme", "Lupou projedeme celý web. Heatmapa pod ní ukáže, kam se lidé opravdu dívají."],
    [1.75, "02 · Najdeme · problém 1 ze 3", "Úvod neříká, co klinika nabízí, a nemá tlačítko k objednání."],
    [1.92, "02 · Najdeme · problém 2 ze 3", "Objednávka chce 7 údajů včetně rodného čísla. Dokončí ji jen 9 % lidí."],
    [2.08, "02 · Najdeme · problém 3 ze 3", "Recenze pacientů jsou úplně dole. Uvidí je 18 % lidí."],
    [2.25, "03 · Přeskládáme", "Recenze posuneme nahoru, hned pod úvod."],
    [2.45, "03 · Přeskládáme", "Úvod dostane jasné sdělení a tlačítko Objednat se."],
    [2.62, "03 · Přeskládáme", "Místo formuláře ukážeme volné termíny na jedno kliknutí."],
    [3.0, "04 · Doladíme", "Web složíme zpátky. K objednání teď dojde 58 % lidí místo 38 %."],
    [3.5, "04 · Doladíme", "Výsledek za 30 dní: skoro 3× víc objednávek."],
  ];
  let beatIdx = -1, beatTimer = 0;
  const setBeat = (idx, instant) => {
    if (!capEl || idx === beatIdx) return;
    beatIdx = idx;
    const [, k, s] = BEATS[idx];
    clearTimeout(beatTimer);
    if (instant || reduce) { capK.textContent = k; capS.textContent = s; capEl.classList.remove("out"); return; }
    capEl.classList.add("out");
    beatTimer = setTimeout(() => { capK.textContent = k; capS.textContent = s; capEl.classList.remove("out"); }, 200);
  };

  /* ---------- stav: scroll a kurzor ---------- */
  const control = { progress: frozenP !== null ? frozenP : 0 };
  const mousePos = { x: 99, y: 99 };
  const mouseWorld = new THREE.Vector3(99, 99, 0);
  const tilt = { x: 0, y: 0 };
  const readProgress = () => {
    if (frozenP !== null) return;
    const r = section.getBoundingClientRect();
    const span = r.height - (window.innerHeight || 800);
    control.progress = span > 0 ? Math.max(0, Math.min(P_MAX, (-r.top / span) * P_MAX)) : 0;
  };
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; readProgress(); });
  }, { passive: true });
  readProgress();

  if (canHover && !reduce) {
    addEventListener("pointermove", (e) => {
      const r = pin.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) { mousePos.x = 99; return; }
      mousePos.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mousePos.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { mousePos.x = 99; });
  }
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  let staticReady = false;
  const fit = () => {
    const w = pin.clientWidth, h = pin.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    view.w = w; view.h = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (frozenP !== null && staticReady) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(pin);
  fit();

  /* pomocné objekty — alokované jednou */
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const target = new THREE.Vector3(), camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  const eulerTmp = new THREE.Euler(), qDyn = new THREE.Quaternion();

  /* ---------- váhy fází ---------- */
  const S = {};
  function computeState(p) {
    S.asm = 1 - ss(0.2, 0.55, p);
    S.exp = ss(0.2, 0.55, p) * (1 - ss(0.95, 1.3, p));
    S.find = ss(0.95, 1.3, p) * (1 - ss(2.2, 2.4, p));
    S.re = ss(2.2, 2.4, p) * (1 - ss(2.9, 3.2, p));
    S.done = ss(2.9, 3.2, p);
    S.focus = FIND.map((f, k) => ss(f.at[0], f.at[0] + 0.05, p) * (1 - (k < 2 ? ss(f.at[1], f.at[1] + 0.04, p) : ss(2.25, 2.35, p))));
    S.focusAny = Math.max(...S.focus);
    S.heat = win(1.25, 1.42, 1.72, 1.85, p) * 1.0 + S.focusAny * 0.3 + ss(3.2, 3.5, p) * 0.45;
    S.lens = reduce ? 0 : win(1.2, 1.3, 1.7, 1.8, p);
    S.lensT = clamp01((p - 1.28) / 0.42);
    S.depthFill = ss(0.75, 1.1, p);
    S.depthMorph = ss(3.1, 3.45, p);
    S.flow = 0.7 * win(1.0, 1.2, 2.2, 2.35, p) + 0.7 * ss(3.15, 3.35, p);
    S.flipHero = ss(2.42, 2.62, p);
    S.flipForm = ss(2.58, 2.78, p);
    S.flash = Math.exp(-Math.pow((p - 3.26) / 0.08, 2));
    S.result = ss(3.5, 3.66, p);
    S.chart = clamp01((p - 3.56) / 0.38);
    return S;
  }

  /* ---------- krok fyziky (pevný krok 1/60 s) ---------- */
  let time = 0;
  function step() {
    time += 1 / 60;
    const p = control.progress;
    computeState(p);
    const sum = S.asm + S.exp + S.find + S.re + S.done || 1;

    let mouseActive = false;
    if (mousePos.x < 2) {
      ndc.set(mousePos.x, mousePos.y);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(zPlane, tmpC)) { mouseWorld.copy(tmpC); mouseActive = true; }
    }
    const tx = mouseActive ? -mousePos.y * 0.06 : 0, ty = mouseActive ? mousePos.x * 0.1 : 0;
    tilt.x += (tx - tilt.x) * 0.05;
    tilt.y += (ty - tilt.y) * 0.05;

    let focusY = 0, focusW = 0;
    for (const s of slabs) {
      const i = s.i;
      target.set(0, 0, 0)
        .addScaledVector(L.asm[i], S.asm).addScaledVector(L.exp[i], S.exp).addScaledVector(L.find[i], S.find)
        .addScaledVector(L.re[i], S.re).addScaledVector(L.done[i], S.done).multiplyScalar(1 / sum);
      /* zaostřená sekce vyjede dopředu */
      FIND.forEach((f, k) => {
        if (f.slab === i && S.focus[k] > 0) {
          target.addScaledVector(tmpA.set(0, 0, 0.55 * SC).applyQuaternion(pageQuat), S.focus[k]);
          focusY += target.y * S.focus[k]; focusW += S.focus[k];
        }
      });
      s.vel.addScaledVector(tmpA.copy(target).sub(s.pos), 0.032);
      if (!reduce) {
        const floatK = 0.2 + S.exp * 0.8 + S.find * 0.4;
        s.vel.y += Math.sin((time * 6.283) / s.period + i * 0.7) * 0.00028 * floatK;
        s.vel.z += Math.cos((time * 6.283) / (s.period + 2) + i * 0.7) * 0.00028 * floatK;
      }
      if (mouseActive) {
        tmpB.copy(s.pos).sub(mouseWorld); tmpB.z = 0;
        const dist = tmpB.length(), rad = 2.0;
        if (dist < rad && dist > 1e-4) {
          const force = (1 - ss(0, 1, dist / rad)) * 0.006;
          s.vel.addScaledVector(tmpB, force / dist);
          s.vel.z -= force * 0.6;
        }
      }
      s.vel.multiplyScalar(lerp(0.9, 0.93, S.re));
      s.pos.add(s.vel);
      s.rot.x += (-s.vel.y * 4 + tilt.x - s.rot.x) * 0.1;
      s.rot.y += (s.vel.x * 4 + s.vel.z * 1.5 + tilt.y - s.rot.y) * 0.1;
    }

    /* kamera: pružina k cíli (celkový záběr / zaostření na nález / výsledek) */
    const fy = focusW > 0 ? focusY / focusW : 0;
    const fk = reduce ? 0 : S.focusAny;
    camTarget.set(0, lerp(0.2, fy * 0.4, fk), lerp(12.4, 11.6, fk) + S.exp * 0.5);
    lookTarget.set(0.4, fy * 0.5 * fk, 0);
    cam.vel.addScaledVector(tmpA.copy(camTarget).sub(cam.pos), 0.02).multiplyScalar(0.86);
    cam.pos.add(cam.vel);
    cam.lookVel.addScaledVector(tmpA.copy(lookTarget).sub(cam.look), 0.02).multiplyScalar(0.86);
    cam.look.add(cam.lookVel);

    /* lupa: pružina k bodu na trase; mimo fázi odjede doprava */
    lensCurve.getPoint(S.lensT, lensLocal);
    if (S.lens > 0.001) lensTarget.copy(lensLocal).multiplyScalar(SC).applyQuaternion(pageQuat).add(PAGE_ORIGIN);
    else lensTarget.set(6.5, lensLocal.y * SC, 1.2);
    lens.vel.addScaledVector(tmpA.copy(lensTarget).sub(lens.pos), 0.05).multiplyScalar(0.8);
    lens.pos.add(lens.vel);

    /* tok lidí */
    if (!reduce) {
      const before = 1 - S.depthMorph;
      for (let k = 0; k < FLOW; k++) {
        const f = flowSeed[k];
        const t = (f.t0 + time * f.speed) % 1;
        const ly = lerp(1.75, -1.75, t);
        let lx = f.lane + Math.sin(time * 0.6 + f.wob) * 0.04;
        let lz = D / 2 + f.z;
        /* kdo odejde: podle hloubky scrollu před úpravou (víc) nebo po ní (méně) */
        let leak = 0;
        const exitDepth = lerp(f.exit < 0.62 ? (f.exit < 0.36 ? Y_FIND[1] - 0.3 : Y_FIND[3]) : -9, f.exit < 0.42 ? Y_DONE[3] : -9, 1 - before);
        if (exitDepth > -8) leak = ss(exitDepth, exitDepth - 0.5, ly);
        lx += Math.sign(f.lane || 1) * leak * 2.2;
        lz += leak * 1.3;
        const a = S.flow * ss(0, 0.06, t) * (1 - ss(0.92, 1, t)) * (1 - leak * 0.94);
        tmpA.set(lx, ly, lz).multiplyScalar(SC).applyQuaternion(pageQuat).add(PAGE_ORIGIN);
        flowPos[k * 3] = tmpA.x; flowPos[k * 3 + 1] = tmpA.y; flowPos[k * 3 + 2] = tmpA.z;
        flowAlpha[k] = a;
      }
      flowGeo.attributes.position.needsUpdate = true;
      flowGeo.attributes.aAlpha.needsUpdate = true;
    }
  }

  /* ---------- zápis do scény a DOM (jednou za snímek) ---------- */
  const steps = [...pin.querySelectorAll(".an-steps li")];
  const bars = steps.map((li) => li.querySelector("i"));
  const STEP_EDGES = [0, 1.25, 2.25, 3.0, 4.0];
  let activeStep = -1;

  function apply() {
    const p = control.progress;
    computeState(p);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);

    const scanY = lerp(2.4, -2.4, clamp01((p - 0.3) / 0.45));
    const scanOn = reduce ? 0 : win(0.26, 0.34, 0.72, 0.8, p);
    scan.position.y = scanY;
    scanMat.uniforms.uOpacity.value = scanOn;

    lensGroup.position.copy(lens.pos);
    lensGroup.quaternion.copy(camera.quaternion);
    lensGroup.rotateZ(clamp01(Math.abs(lens.vel.x) * 6) * Math.sign(lens.vel.x) * -0.25);
    lensGroup.scale.setScalar(Math.max(0.001, S.lens));
    lensGlassMat.uniforms.uOpacity.value = S.lens;

    for (const s of slabs) {
      const { i, d, group, fmat } = s;
      group.position.copy(s.pos);
      let flip = 0;
      if (i === 1) flip = S.flipHero;
      if (i === 3) flip = S.flipForm;
      eulerTmp.set(s.rot.x + (reduce ? 0 : flip * Math.PI * 2), s.rot.y, 0);
      qDyn.setFromEuler(eulerTmp);
      group.quaternion.copy(pageQuat).premultiply(qDyn);

      const u = fmat.uniforms;
      if (d.b) u.uMix.value = flip >= 0.5 ? 1 : 0;
      const beforeK = 1 - S.depthMorph;
      const reveal = p > 1.75 ? 1 : ss(lensPassT[i] - 0.06, lensPassT[i] + 0.06, S.lensT);
      const lensBeat = win(1.2, 1.3, 1.7, 1.8, p);
      u.uHeat.value = S.heat * lerp(d.depthA, d.depthB, S.depthMorph) / 100 * (0.6 + 0.4 * beforeK) * lerp(1, 0.08 + 0.3 * reveal, lensBeat);
      u.uHeatMix.value = ss(2.3, 2.8, p);
      /* ztlumení všeho, co není právě zaostřené */
      let mine = 0;
      FIND.forEach((f, k) => { if (f.slab === i) mine = Math.max(mine, S.focus[k]); });
      const dim = reduce ? 0 : clamp01(S.focusAny - mine);
      u.uDim.value = dim;
      const isProblem = i === 1 || i === 3 || i === 4;
      u.uEdge.value = S.flash * 0.9 + mine * 0.5;
      s.frameMat.opacity = isProblem ? Math.max(mine, S.re * 0.55 * (i === 4 || flip > 0 ? 1 : 0.6)) : 0;
      s.frameMat.emissiveIntensity = 0.2 + 0.8 * s.frameMat.opacity;
      const localY = scanY - (s.pos.y - PAGE_ORIGIN.y) / SC;
      u.uScanY.value = localY / d.h + 0.5;
      u.uScan.value = scanOn;
      /* kam na ploše sekce lupa míří: průsečík paprsku kamera → lupa s rovinou sekce */
      u.uLensOn.value = 0;
      if (S.lens > 0.01) {
        group.updateMatrixWorld();
        planeN.set(0, 0, 1).applyQuaternion(group.quaternion);
        rayDir.copy(lens.pos).sub(camera.position);
        const den = planeN.dot(rayDir);
        if (Math.abs(den) > 1e-4) {
          const t = planeN.dot(tmpA.copy(group.position).sub(camera.position)) / den;
          hit.copy(camera.position).addScaledVector(rayDir, t);
          group.worldToLocal(hit);
          u.uLensC.value.set(hit.x / W + 0.5, hit.y / d.h + 0.5);
          u.uLensOn.value = S.lens;
        }
      }

    }

    /* štítky sekcí (HTML): vedle levé hrany sekce; objeví se, když je mine paprsek, pak ukážou hloubku scrollu */
    scene.updateMatrixWorld();
    for (const s of slabs) {
      const { i, d } = s;
      const c = chips[i];
      tmpB.set(-W / 2, 0, D / 2);
      s.group.localToWorld(tmpB);
      const [sx, sy] = toScreen(tmpB);
      const passed = p >= 0.8 ? 1 : ss(Y_EXP[i] + 0.15, Y_EXP[i] - 0.15, scanY);
      const op = (reduce ? ss(0.3, 0.6, p) : passed) * (1 - 0.85 * S.focusAny) * (1 - S.re * 0.8);
      c.e.style.opacity = op.toFixed(3);
      c.e.style.transform = `translate3d(${(sx - 150).toFixed(1)}px, ${(sy - 24).toFixed(1)}px, 0)`;
      const value = lerp(d.depthA, d.depthB, S.depthMorph);
      const fill = clamp01((S.depthFill - i * 0.08) / 0.6);
      const key = `${Math.round(fill * 100)}|${Math.round(value)}`;
      if (key !== c.key) {
        c.key = key;
        c.v.textContent = fill > 0.01 ? `${Math.round(value * fill)} %` : "";
        c.bar.style.transform = `scaleX(${((value / 100) * fill).toFixed(3)})`;
        c.e.classList.toggle("low", value < 50);
      }
    }

    /* nálezy (HTML): značka na sekci, čára a karta vpravo */
    const cardX = view.w - CARD_W - 16 + tilt.y * 40;
    findings.forEach((f) => {
      const s = slabs[f.slab];
      const [au, av] = defs[f.slab].anchor;
      f.anchorW.set((au - 0.5) * W, (av - 0.5) * defs[f.slab].h, D / 2 + 0.05);
      s.group.localToWorld(f.anchorW);
      [f.ax, f.ay] = toScreen(f.anchorW);
      f.h = f.card.offsetHeight || 132;
    });
    /* karty podle výšky kotvy, nikdy přes sebe */
    let prevBottom = -Infinity;
    [...findings].sort((a, b) => a.ay - b.ay).forEach((f) => {
      f.cy = Math.max(f.ay - f.h / 2, prevBottom + CARD_GAP);
      prevBottom = f.cy + f.h;
    });
    findings.forEach((f, k) => {
      const vis = ss(f.at[0] + 0.01, f.at[0] + 0.07, p) * (1 - ss(2.28, 2.42, p));
      f.card.style.opacity = vis.toFixed(3);
      f.card.style.transform = `translate3d(${(cardX + (1 - vis) * 24).toFixed(1)}px, ${f.cy.toFixed(1)}px, 0)`;
      f.mark.style.opacity = vis.toFixed(3);
      const pulse = reduce ? 1 : 1 + 0.08 * Math.sin(time * 4 + k);
      f.mark.style.transform = `translate3d(${(f.ax - 16).toFixed(1)}px, ${(f.ay - 16).toFixed(1)}px, 0) scale(${(pulse * lerp(0.6, 1, vis)).toFixed(3)})`;
      const tx = cardX, ty = f.cy + f.h / 2;
      const dx = tx - f.ax, dy = ty - f.ay;
      const len = Math.hypot(dx, dy) * vis;
      f.line.style.opacity = (vis * 0.9).toFixed(3);
      f.line.style.transform = `translate3d(${f.ax.toFixed(1)}px, ${f.ay.toFixed(1)}px, 0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${(len / 100).toFixed(4)})`;
    });

    /* výsledek (HTML) */
    resEl.style.opacity = S.result.toFixed(3);
    resEl.style.transform = `translate3d(${(view.w - 240 - 12 + tilt.y * 40 + (1 - S.result) * 30).toFixed(1)}px, ${(view.h * 0.5 - 40).toFixed(1)}px, 0)`;
    const q = Math.round(S.chart * 60) / 60;
    if (q !== lastChart && S.result > 0) {
      lastChart = q;
      resBig.textContent = String(Math.round(lerp(14, 41, clamp01(q * 1.2))));
      drawChart(q);
    }

    /* záře pozadí: barvy jako CSS proměnné */
    const warm = S.done, alarm = S.focusAny;
    pin.style.setProperty("--an-a", (0.75 + 0.15 * S.find + 0.1 * warm).toFixed(3));
    pin.style.setProperty("--an-b", (0.85 + 0.15 * alarm).toFixed(3));
    hemi.groundColor.setRGB(lerp(0, 0.45, warm), lerp(0.21, 0.33, warm), lerp(0.4, 0.1, warm));

    /* titulek a kroky vlevo */
    let bi = 0;
    for (let k = 0; k < BEATS.length; k++) if (p >= BEATS[k][0]) bi = k;
    setBeat(bi, frozenP !== null);
    let st = 3;
    for (let k = 0; k < 4; k++) if (p < STEP_EDGES[k + 1]) { st = k; break; }
    if (st !== activeStep) {
      activeStep = st;
      steps.forEach((li, i) => li.classList.toggle("on", i === st));
    }
    if (!reduce) {
      bars.forEach((bar, i) => {
        const u = i !== st ? 0 : clamp01((p - STEP_EDGES[i]) / (STEP_EDGES[i + 1] - STEP_EDGES[i]));
        bar.style.transform = `scaleX(${u.toFixed(4)})`;
      });
    }
  }

  /* ---------- smyčka ---------- */
  let rafId = 0, last = 0, acc = 0, visible = false;
  const showCanvas = () => canvas.classList.add("ready");

  if (frozenP !== null) {
    time = parseFloat(params.get("time") || "3");
    const n = parseInt(params.get("steps") || "360", 10);
    for (let k = 0; k < n; k++) step();
    apply();
    renderer.render(scene, camera);
    staticReady = true;
    canvas.style.transition = "none";
    showCanvas();
    return;
  }

  const frame = (now) => {
    rafId = requestAnimationFrame(frame);
    if (!last) last = now;
    acc = Math.min(acc + (now - last) / 1000, 4 / 60);
    last = now;
    let stepped = false;
    while (acc >= 1 / 60) { step(); acc -= 1 / 60; stepped = true; }
    if (stepped) { apply(); renderer.render(scene, camera); showCanvas(); }
  };
  const run = () => {
    const should = visible && !document.hidden;
    if (should && !rafId) { last = 0; acc = 1 / 60; rafId = requestAnimationFrame(frame); }
    if (!should && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  };
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    readProgress();
    run();
  }, { threshold: 0.02 }).observe(section);
  document.addEventListener("visibilitychange", run);
  if (params.has("debug")) window.__an = () => ({ visible, rafId, progress: control.progress, hidden: document.hidden, beat: beatIdx });

  addEventListener("pagehide", () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    geoms.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    texes.forEach((t) => t.dispose());
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
  });
}
