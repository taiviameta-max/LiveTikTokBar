import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import djBoothImageUrl from './assets/dj-booth.png?url';
import { getAvatarProxyUrl, getBridgeSocketUrl } from './live-bridge.js';
import {
  ADMIN_TEST_EVENT_KEY,
  GIFT_EFFECTS,
  LIVE_SETTINGS_KEY,
  getCommentEffect,
  getLiveHints,
  loadLiveSettings,
  normalizeLiveSettings,
} from './live-settings.js';

const NAMES = [
  'Dũng trần', 'Lê giang', 'Tuấn Tít', 'Hồng Phạm', 'Thanh Tâm', 'Ngọc Nguyễn',
  'Kim Nhung', 'phát duyệt', 'The best', 'Minh Anh', 'Bé Na', 'Hải Đăng',
  'Trang ka', 'Quỳnh Như',
];
const GIFTS = ['ZOOM', 'FLY_ZOOM', 'SANTO', 'BREAKDANCE', 'ĐI VÒNG', 'PHÁO HOA', 'ĐỔI NHÂN VẬT'];
const CHARACTER_VIDEOS = Object.entries(import.meta.glob('./**/*.{mp4,webm,mov,m4v,ogg}', {
  eager: true,
  query: '?url',
  import: 'default',
})).map(([path, source]) => ({ path, source, name: path.split('/').pop() }));
const VIDEO_CHARACTER_HEIGHT = 1.35;
const MAX_BAR_USERS = 200;
const MAX_DEMO_USERS = 12;
const MAX_ACTIVE_DANCE_VIDEOS = 4;
const VIDEO_PLAYBACK_RATE = 1;
const DEMO_MODE_ENABLED = import.meta.env.VITE_ENABLE_DEMO === 'true';
const DJ_VIDEO_NAME = 'vd10.mp4';
const DJ_ZOOM_INTERVAL = 30;
const DJ_ZOOM_DURATION = 3.5;
const FLY_ZOOM_DURATION = 4.5;
const LIKE_ZOOM_COOLDOWN = 3;
const FLY_HEIGHT = 4;
const BAR_NPCS = [
  { name: 'Chủ quán Bar', position: [-3.2, 0, 1.8] },
  { name: 'Nhân viên', position: [0, 0, 2.5] },
  { name: 'Chú bảo vệ', position: [3.2, 0, 1.8] },
];

const randomBetween = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.random() * items.length | 0];
const now = () => performance.now() / 1000;

function App() {
  const canvasHost = useRef(null);
  const api = useRef(null);
  const liveSettings = useRef(loadLiveSettings());
  const demoEnabled = useRef(DEMO_MODE_ENABLED);
  const toastTimers = useRef(new Set());
  const [feed, setFeed] = useState([]);
  const [demo, setDemo] = useState(DEMO_MODE_ENABLED);
  const [tiktokStatus, setTikTokStatus] = useState('connecting');
  const [liveHints, setLiveHints] = useState(() => getLiveHints(liveSettings.current));

  const toast = useCallback((content) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFeed((current) => [...current.slice(-3), { id, ...content }]);
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer);
      setFeed((current) => current.filter((item) => item.id !== id));
    }, 4000);
    toastTimers.current.add(timer);
  }, []);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return undefined;
    let sceneSettings = liveSettings.current;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030f);
    scene.fog = new THREE.Fog(0x05030f, 16, 42);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0x9a88cc, 1.1));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(3, 8, 6);
    scene.add(directionalLight);
    [[-5, 0xff3df2], [5, 0x27e8ff]].forEach(([x, color]) => {
      const light = new THREE.PointLight(color, 1.3, 22);
      light.position.set(x, 4, 0);
      scene.add(light);
    });

    const tiles = [];
    const tileGeometry = new THREE.BoxGeometry(0.92, 0.06, 0.92);
    const floorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(13.92, 22),
      new THREE.MeshBasicMaterial({ color: 0x100b26 }),
    );
    floorBase.rotation.x = -Math.PI / 2;
    floorBase.position.set(0, -0.045, 5.5);
    scene.add(floorBase);
    for (let i = -7; i < 7; i += 1) {
      for (let j = -5; j < 17; j += 1) {
        const mesh = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({ color: 0 }));
        mesh.position.set(i + 0.5, 0, j);
        scene.add(mesh);
        tiles.push([mesh, i, j]);
      }
    }

    const bars = [];
    const barGeometry = new THREE.BoxGeometry(0.38, 1, 0.38);
    barGeometry.translate(0, 0.5, 0);
    for (let i = 0; i < 28; i += 1) {
      const bar = new THREE.Mesh(
        barGeometry,
        new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 28 * 0.85, 1, 0.55) }),
      );
      bar.position.set(-6.75 + i * 0.5, 0, -6.2);
      scene.add(bar);
      bars.push(bar);
    }

    const rings = [];
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 3; i += 1) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.13, 10, 28),
          new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff3df2 : 0x27e8ff }),
        );
        ring.position.set(side * 7.8, 1.2 + i * 1.2, -5.6);
        scene.add(ring);
        rings.push(ring);
      }
    });

    const stage = new THREE.Group();
    const stagePlatform = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.28, 3.8),
      new THREE.MeshStandardMaterial({
        color: 0x171126,
        metalness: 0.72,
        roughness: 0.28,
        emissive: 0x230d3a,
        emissiveIntensity: 0.7,
      }),
    );
    stagePlatform.position.set(0, 0.02, -5.05);
    stage.add(stagePlatform);
    const ledFrame = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 3.5, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x100b1d,
        metalness: 0.65,
        roughness: 0.3,
        emissive: 0x361044,
        emissiveIntensity: 0.45,
      }),
    );
    ledFrame.position.set(0, 2.8, -7.05);
    stage.add(ledFrame);
    const ledCanvas = document.createElement('canvas');
    ledCanvas.width = 768;
    ledCanvas.height = 320;
    const ledContext = ledCanvas.getContext('2d');
    if (!ledContext) throw new Error('Unable to create the LED screen canvas.');
    const ledTexture = new THREE.CanvasTexture(ledCanvas);
    let ledImage = null;
    let ledImageSource = '';
    const ledScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(8.15, 3.15),
      new THREE.MeshBasicMaterial({ map: ledTexture, toneMapped: false }),
    );
    ledScreen.position.set(0, 3.45, -6.89);
    ledScreen.rotation.x = -0.1;
    ledFrame.position.y = 3.45;
    ledFrame.rotation.x = -0.1;
    stage.position.y = 0.45;

    const djCat = new THREE.Sprite(createVideoMaterial());
    djCat.position.set(0, 2.62, -5.2);
    djCat.visible = false;
    stage.add(djCat);
    const boothTexture = new THREE.TextureLoader().load(djBoothImageUrl);
    boothTexture.colorSpace = THREE.SRGBColorSpace;
    boothTexture.repeat.set(351 / 656, 179 / 381);
    boothTexture.offset.set(134 / 656, 1 - 289 / 381);
    const boothImage = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 4.8 * 179 / 351),
      new THREE.MeshBasicMaterial({
        map: boothTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    boothImage.position.set(0, 1.38, -4.65);
    stage.add(boothImage);
    function makeMonitorLabel(title, accent) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create a DJ monitor label canvas.');
      function drawLabel(text) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#080b14';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = accent;
        context.shadowBlur = 24;
        context.fillStyle = accent;
        context.font = '900 64px system-ui,sans-serif';
        context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 24);
        context.shadowBlur = 0;
        context.strokeStyle = accent;
        context.globalAlpha = 0.7;
        context.lineWidth = 5;
        context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        context.globalAlpha = 1;
      }
      drawLabel(title);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const monitor = new THREE.Mesh(
        new THREE.PlaneGeometry(1.31, 0.58),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
      );
      monitor.renderOrder = 2;
      monitor.userData.updateTitle = (nextTitle) => {
        drawLabel(nextTitle);
        texture.needsUpdate = true;
      };
      return monitor;
    }
    const djMonitor = makeMonitorLabel('DJ TaiJ8888', '#65f7ff');
    djMonitor.position.set(-0.73, 2.26, -4.63);
    stage.add(djMonitor);
    const mcMonitor = makeMonitorLabel('MC TaiMC8888', '#ff85ee');
    mcMonitor.position.set(0.75, 2.26, -4.63);
    stage.add(mcMonitor);
    const djAccentMaterials = [
      new THREE.MeshBasicMaterial({
      color: 0x27e8ff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      }),
      new THREE.MeshBasicMaterial({
        color: 0xff3df2,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ];
    const djAccent = new THREE.Group();
    djAccent.position.set(0, 1.38, -4.72);
    [
      [4.65, 0.045, 0.035, 0, -1.12],
      [0.045, 1.95, 0.035, -2.28, 0],
      [0.045, 1.95, 0.035, 2.28, 0],
      [0.38, 0.045, 0.035, -2.05, 0.95],
      [0.38, 0.045, 0.035, 2.05, 0.95],
    ].forEach(([width, height, depth, x, y], index) => {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        djAccentMaterials[index % djAccentMaterials.length],
      );
      strip.position.set(x, y, 0);
      djAccent.add(strip);
    });
    stage.add(djAccent);
    const djGlow = new THREE.PointLight(0x27e8ff, 2.2, 5);
    djGlow.position.set(0, 1.2, -3.95);
    stage.add(djGlow);
    stage.add(ledScreen);
    scene.add(stage);

    const spotlights = [];
    const spotlightGeometry = new THREE.CylinderGeometry(2.2, 0, 10, 24, 1, true);
    [-1, 1].forEach((side, index) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 4.1, 9, -5.5);
      const beam = new THREE.Mesh(
        spotlightGeometry,
        new THREE.MeshBasicMaterial({
          color: index === 0 ? 0xff3df2 : 0x27e8ff,
          transparent: true,
          opacity: 0.045,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.y = -5;
      pivot.add(beam);
      scene.add(pivot);
      spotlights.push({ pivot, side, phase: index * Math.PI });
    });

    const laserTruss = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x11111d, metalness: 0.82, roughness: 0.3 }),
    );
    laserTruss.position.set(0, 6.35, -6.2);
    scene.add(laserTruss);
    const laserHeads = [];
    const laserHeadMaterial = new THREE.MeshStandardMaterial({
      color: 0x191827,
      metalness: 0.65,
      roughness: 0.26,
      emissive: 0x38104d,
      emissiveIntensity: 0.45,
    });
    const laserLensMaterials = [0xff2bd6, 0x27e8ff].map((color) => (
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    ));
    [-1, 1].forEach((side, index) => {
      const head = new THREE.Group();
      head.position.set(side * 3.3, 6.2, -6.2);
      const yoke = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.52, 12), laserHeadMaterial);
      body.position.y = -0.26;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), laserLensMaterials[index]);
      lens.rotation.x = Math.PI / 2;
      lens.position.y = -0.53;
      yoke.add(body, lens);
      [-0.24, 0.24].forEach((x) => {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.58, 0.08),
          laserHeadMaterial,
        );
        arm.position.set(x, -0.25, -0.12);
        yoke.add(arm);
      });
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.28, 0.18, 12),
        laserHeadMaterial,
      );
      base.position.y = 0.1;
      head.add(base, yoke);
      scene.add(head);
      laserHeads.push({ head, yoke });
    });

    const laserBeams = [];
    const laserGeometry = new THREE.CylinderGeometry(0.002, 0.012, 13, 8, 1, true);
    const laserImpactGeometry = new THREE.CircleGeometry(0.72, 32);
    const laserImpactCanvas = document.createElement('canvas');
    laserImpactCanvas.width = 128;
    laserImpactCanvas.height = 128;
    const impactContext = laserImpactCanvas.getContext('2d');
    if (!impactContext) throw new Error('Unable to create a laser impact texture.');
    const impactGradient = impactContext.createRadialGradient(64, 64, 2, 64, 64, 64);
    impactGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    impactGradient.addColorStop(0.2, 'rgba(255,255,255,0.62)');
    impactGradient.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    impactGradient.addColorStop(1, 'rgba(255,255,255,0)');
    impactContext.fillStyle = impactGradient;
    impactContext.fillRect(0, 0, 128, 128);
    const laserImpactTexture = new THREE.CanvasTexture(laserImpactCanvas);
    const laserImpactMaterials = [0xff2bd6, 0x27e8ff].map((color) => (
      new THREE.MeshBasicMaterial({
        color,
        map: laserImpactTexture,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    ));
    [-1, 1].forEach((side, index) => {
      const beamCount = 12;
      for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 3.3, 6.4, -6.2);
        const material = new THREE.MeshBasicMaterial({
          color: index === 0 ? 0xff2bd6 : 0x27e8ff,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        });
        const beam = new THREE.Mesh(laserGeometry, material);
        beam.position.y = -6.5;
        pivot.add(beam);
        scene.add(pivot);
        const impact = new THREE.Group();
        impact.position.y = 0.045;
        const glow = new THREE.Mesh(laserImpactGeometry, laserImpactMaterials[index]);
        glow.rotation.x = -Math.PI / 2;
        glow.scale.set(1.5, 0.85, 1);
        impact.add(glow);
        scene.add(impact);
        laserBeams.push({
          pivot,
          material,
          impact,
          sideIndex: index,
          beamIndex,
          phase: index * Math.PI + beamIndex * 0.12,
          spread: (beamIndex - (beamCount - 1) / 2) * 0.2,
        });
      }
    });

    function applySceneSettings(nextSettings) {
      sceneSettings = normalizeLiveSettings(nextSettings);
      liveSettings.current = sceneSettings;
      djMonitor.userData.updateTitle(sceneSettings.djName);
      mcMonitor.userData.updateTitle(sceneSettings.mcName);
      if (ledImageSource !== sceneSettings.ledImage) {
        ledImageSource = sceneSettings.ledImage;
        ledImage = null;
        if (ledImageSource) {
          const imageSource = ledImageSource;
          const image = new Image();
          image.onload = () => {
            if (ledImageSource !== imageSource) return;
            ledImage = image;
            ledTexture.needsUpdate = true;
          };
          image.onerror = (error) => {
            console.error('Unable to load the configured LED image:', error);
          };
          image.src = ledImageSource;
        }
      }
      spotlights.forEach(({ pivot }) => {
        pivot.visible = sceneSettings.lightsEnabled;
      });
      laserTruss.visible = sceneSettings.lasersEnabled;
      laserHeads.forEach(({ head }) => {
        head.visible = sceneSettings.lasersEnabled;
      });
      laserBeams.forEach(({ pivot, impact }) => {
        pivot.visible = sceneSettings.lasersEnabled;
        impact.visible = sceneSettings.lasersEnabled;
      });
    }
    applySceneSettings(sceneSettings);

    const users = new Map();
    const fireworks = [];
    const adminTestTimers = new Map();
    const delayedEffects = new Set();
    const ringGeometries = [
      new THREE.TorusGeometry(0.4, 0.035, 8, 48),
      new THREE.TorusGeometry(0.56, 0.012, 6, 48),
    ];
    const ringColors = [0xff3df2, 0x27e8ff, 0xffd23f, 0x6bff8a];
    const danceVideos = [];
    const danceVideoElements = [];
    const pendingCharacterChanges = new Set();
    let activeDanceVideos = [];
    let disposed = false;
    let zoomUser = null;
    let zoomUntil = 0;
    let nextDjZoomAt = now() + DJ_ZOOM_INTERVAL;
    let djZoomUntil = 0;

    function createVideoMaterial() {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
      });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          #ifdef USE_MAP
          vec3 keyRgb = pow(max(sampledDiffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
          float keyBrightness = min(keyRgb.r, min(keyRgb.g, keyRgb.b));
          float keySpread = max(keyRgb.r, max(keyRgb.g, keyRgb.b)) - keyBrightness;
          float brightnessMask = smoothstep(0.78, 0.92, keyBrightness);
          float neutralMask = 1.0 - smoothstep(0.047, 0.141, keySpread);
          diffuseColor.a *= 1.0 - brightnessMask * neutralMask;
          #endif`,
        );
      };
      material.customProgramCacheKey = () => 'white-background-key-v1';
      return material;
    }

    function applyVisual(user, visual) {
      user.videoVisual = visual;
      user.sprite.material.map = visual.texture;
      user.sprite.scale.set(VIDEO_CHARACTER_HEIGHT * visual.aspect, VIDEO_CHARACTER_HEIGHT, 1);
      user.sprite.material.needsUpdate = true;
    }

    function chooseDanceVideo(user, avoidCurrent = false) {
      const usedCounts = new Map(activeDanceVideos.map((visual) => [visual, 0]));
      users.forEach((other) => {
        if (other !== user && other.videoVisual) {
          usedCounts.set(other.videoVisual, (usedCounts.get(other.videoVisual) || 0) + 1);
        }
      });
      let candidates = activeDanceVideos.filter((visual) => (
        !avoidCurrent || visual !== user.videoVisual
      ));
      if (!candidates.length) candidates = activeDanceVideos;
      const leastUsed = Math.min(...candidates.map((visual) => usedCounts.get(visual) || 0));
      return pick(candidates.filter((visual) => (usedCounts.get(visual) || 0) === leastUsed));
    }

    function changeCharacter(user) {
      if (danceVideos.length < 2) {
        pendingCharacterChanges.add(user);
        return;
      }

      const currentIndex = danceVideos.indexOf(user.videoVisual);
      let visual = danceVideos[(currentIndex + 1) % danceVideos.length];
      if (!activeDanceVideos.includes(visual)) {
        if (activeDanceVideos.length < MAX_ACTIVE_DANCE_VIDEOS) {
          activeDanceVideos.push(visual);
        } else {
          const replaceIndex = activeDanceVideos.findIndex((activeVisual) => (
            ![...users.values()].some((other) => (
              other !== user && other.videoVisual === activeVisual
            ))
          ));
          if (replaceIndex >= 0) {
            activeDanceVideos[replaceIndex] = visual;
          } else {
            const activeIndex = activeDanceVideos.indexOf(user.videoVisual);
            visual = activeDanceVideos[(activeIndex + 1) % activeDanceVideos.length];
          }
        }
        syncVideoPlayback();
      }

      applyVisual(user, visual);
      user.born = now();
      user.dropHeight = randomBetween(12, 14);
      pendingCharacterChanges.delete(user);
    }

    function syncVideoPlayback() {
      danceVideos.forEach((visual) => {
        const shouldPlay = activeDanceVideos.includes(visual);
        if (shouldPlay && visual.video.paused && !visual.playRequested) {
          visual.playRequested = true;
          visual.video.play().then(() => {
            visual.playRequested = false;
            if (disposed || !activeDanceVideos.includes(visual)) visual.video.pause();
          }).catch((error) => {
            visual.playRequested = false;
            if (error.name === 'AbortError') return;
            console.error(`Unable to play character video "${visual.name}".`, error);
          });
        } else if (!shouldPlay) {
          visual.video.pause();
          visual.playRequested = false;
        }
      });
    }

    function assignDistinctDanceVideos() {
      const shuffled = [...danceVideos];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const swapIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[i]];
      }
      const djVideo = danceVideos.find(({ name }) => name.toLowerCase() === DJ_VIDEO_NAME);
      activeDanceVideos = activeDanceVideos.filter((visual) => danceVideos.includes(visual));
      if (!activeDanceVideos.length && djVideo) activeDanceVideos.push(djVideo);
      if (djVideo && !activeDanceVideos.includes(djVideo)) {
        const replaceIndex = activeDanceVideos.findIndex((visual) => (
          ![...users.values()].some((user) => user.videoVisual === visual)
        ));
        if (replaceIndex >= 0) activeDanceVideos[replaceIndex] = djVideo;
      }
      shuffled.forEach((visual) => {
        if (activeDanceVideos.length < MAX_ACTIVE_DANCE_VIDEOS && !activeDanceVideos.includes(visual)) {
          activeDanceVideos.push(visual);
        }
      });
      const usedCounts = new Map(activeDanceVideos.map((visual) => [visual, 0]));
      const npcVisuals = new Set();
      users.forEach((user) => {
        if (!user.isNpc) return;
        if (!activeDanceVideos.includes(user.videoVisual) || npcVisuals.has(user.videoVisual)) {
          const available = activeDanceVideos.filter((visual) => !npcVisuals.has(visual));
          const candidates = available.length ? available : activeDanceVideos;
          const leastUsed = Math.min(...candidates.map((visual) => usedCounts.get(visual) || 0));
          const visual = pick(candidates.filter((item) => (usedCounts.get(item) || 0) === leastUsed));
          applyVisual(user, visual);
        }
        npcVisuals.add(user.videoVisual);
        usedCounts.set(user.videoVisual, (usedCounts.get(user.videoVisual) || 0) + 1);
      });
      users.forEach((user) => {
        if (user.isNpc) return;
        if (!user.videoVisual || !activeDanceVideos.includes(user.videoVisual)) {
          const leastUsed = Math.min(...activeDanceVideos.map((visual) => usedCounts.get(visual) || 0));
          const visual = pick(activeDanceVideos.filter((item) => (usedCounts.get(item) || 0) === leastUsed));
          applyVisual(user, visual);
          usedCounts.set(visual, (usedCounts.get(visual) || 0) + 1);
        } else {
          usedCounts.set(user.videoVisual, (usedCounts.get(user.videoVisual) || 0) + 1);
        }
      });
      syncVideoPlayback();
      if (danceVideos.length > 1) {
        [...pendingCharacterChanges].forEach((user) => {
          if (users.get(user.name) === user) changeCharacter(user);
          else pendingCharacterChanges.delete(user);
        });
      }
    }

    CHARACTER_VIDEOS.forEach(({ source, name }) => {
      const video = document.createElement('video');
      video.src = source;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.defaultPlaybackRate = VIDEO_PLAYBACK_RATE;
      video.playbackRate = VIDEO_PLAYBACK_RATE;
      video.preload = 'auto';
      danceVideoElements.push(video);
      video.onloadeddata = () => {
        if (disposed) {
          video.pause();
          video.removeAttribute('src');
          video.load();
          return;
        }
        if (danceVideos.some((visual) => visual.video === video)) return;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 256 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error(`Unable to create a video canvas for "${name}".`);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const visual = {
          name,
          video,
          playRequested: false,
          canvas,
          context,
          lastVideoTime: video.currentTime,
          texture: new THREE.CanvasTexture(canvas),
          aspect: video.videoWidth / video.videoHeight,
        };
        visual.texture.minFilter = THREE.LinearFilter;
        visual.texture.magFilter = THREE.LinearFilter;
        visual.texture.generateMipmaps = false;
        visual.texture.colorSpace = THREE.SRGBColorSpace;
        if (name.toLowerCase() === DJ_VIDEO_NAME) {
          djCat.material.map = visual.texture;
          djCat.scale.set(2.25 * visual.aspect, 2.25, 1);
          djCat.visible = true;
          djCat.material.needsUpdate = true;
        }
        danceVideos.push(visual);
        assignDistinctDanceVideos();
      };
      video.onerror = () => {
        console.error(`Unable to load character video "${name}".`, video.error);
      };
      video.load();
    });

    function nameSprite(name) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create a canvas context for the name label.');
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      let currentName = name;
      let avatarUrl = '';
      let avatarImage = null;

      function redraw() {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'rgba(0,0,0,.68)';
        context.beginPath();
        if (context.roundRect) context.roundRect(4, 8, 248, 48, 24);
        else context.rect(4, 8, 248, 48);
        context.fill();

        context.save();
        context.beginPath();
        context.arc(32, 32, 22, 0, Math.PI * 2);
        context.clip();
        if (avatarImage) {
          const size = Math.min(avatarImage.naturalWidth, avatarImage.naturalHeight);
          const sourceX = (avatarImage.naturalWidth - size) / 2;
          const sourceY = (avatarImage.naturalHeight - size) / 2;
          context.drawImage(avatarImage, sourceX, sourceY, size, size, 10, 10, 44, 44);
        } else {
          context.fillStyle = '#38285c';
          context.fillRect(10, 10, 44, 44);
          context.fillStyle = '#c8faff';
          context.font = 'bold 23px system-ui,sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(currentName.slice(0, 1).toUpperCase(), 32, 33);
        }
        context.restore();

        context.beginPath();
        context.arc(32, 32, 22, 0, Math.PI * 2);
        context.strokeStyle = '#27e8ff';
        context.lineWidth = 3;
        context.stroke();
        context.fillStyle = '#fff';
        context.font = 'bold 24px system-ui,sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText(currentName.slice(0, 13), 64, 33, 180);
        texture.needsUpdate = true;
      }

      function update(labelName, nextAvatarUrl) {
        currentName = labelName;
        redraw();
        if (typeof nextAvatarUrl !== 'string' || !nextAvatarUrl.startsWith('https://')
          || nextAvatarUrl === avatarUrl) return;

        avatarUrl = nextAvatarUrl;
        avatarImage = null;
        redraw();
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (avatarUrl !== nextAvatarUrl) return;
          avatarImage = image;
          redraw();
        };
        image.onerror = () => {
          if (avatarUrl === nextAvatarUrl) {
            console.warn(`Unable to load TikTok avatar for "${currentName}".`);
          }
        };
        image.src = getAvatarProxyUrl(nextAvatarUrl);
      }

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }));
      sprite.scale.set(1.6, 0.4, 1);
      sprite.position.y = 1.8;
      update(name);
      return { sprite, update };
    }

    function makeCharacter(name) {
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      const sprite = new THREE.Sprite(createVideoMaterial());
      sprite.position.y = 0.8;
      sprite.scale.set(VIDEO_CHARACTER_HEIGHT * 0.6, VIDEO_CHARACTER_HEIGHT, 1);
      const nameLabel = nameSprite(name);
      group.add(sprite, nameLabel.sprite);
      return {
        group,
        sprite,
        videoVisual: null,
        label: nameLabel.sprite,
        updateLabel: nameLabel.update,
        arms: [],
      };
    }

    function removeUser(name) {
      const user = users.get(name);
      if (!user || user.isNpc) return;
      scene.remove(user.group, user.ring);
      user.sprite.material.dispose();
      user.label.material.map?.dispose();
      user.label.material.dispose();
      user.ring.traverse((object) => object.material?.dispose());
      users.delete(name);
      pendingCharacterChanges.delete(user);
      if (zoomUser === user) {
        zoomUser = null;
        zoomUntil = 0;
      }
    }

    function spawn(
      name,
      isDemo = false,
      isNpc = false,
      homePosition,
      displayName = name,
      avatarUrl = '',
    ) {
      if (users.size >= MAX_BAR_USERS) {
        const oldestName = [...users.entries()].find(([, user]) => !user.isNpc)?.[0];
        if (!oldestName) {
          console.error('Cannot add a bar user because no non-NPC user can be replaced.');
          return null;
        }
        removeUser(oldestName);
      }
      const character = makeCharacter(displayName);
      character.updateLabel(displayName, avatarUrl);
      if (danceVideos.length) applyVisual(character, chooseDanceVideo(character));
      const ring = new THREE.Group();
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.052;
      const ringColor = pick(ringColors);
      const core = new THREE.Mesh(
        ringGeometries[0],
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const halo = new THREE.Mesh(
        ringGeometries[1],
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.add(core, halo);
      const user = {
        name,
        displayName,
        avatarUrl,
        isDemo,
        isNpc,
        ...character,
        ring,
        ringCore: core,
        ringHalo: halo,
        home: homePosition
          ? new THREE.Vector3(...homePosition)
          : new THREE.Vector3(randomBetween(-4.8, 4.8), 0, randomBetween(-2.8, 3.8)),
        state: 'idle',
        start: 0,
        until: 0,
        phase: randomBetween(0, 6.28),
        born: now(),
        angleStart: 0,
        radius: 0,
        moveTarget: new THREE.Vector3(),
        nextMoveAt: now() + randomBetween(2, 5),
        dropHeight: randomBetween(12, 14),
        lastLikeZoomAt: Number.NEGATIVE_INFINITY,
      };
      character.group.position.copy(user.home);
      character.group.position.y = user.dropHeight;
      user.moveTarget.copy(user.home);
      character.group.scale.setScalar(0.001);
      ring.position.x = character.group.position.x;
      ring.position.z = character.group.position.z;
      scene.add(character.group, ring);
      users.set(name, user);
      return user;
    }

    function getUser(name, isDemo = false, displayName = name, avatarUrl = '') {
      const user = users.get(name);
      if (user) {
        user.displayName = displayName;
        if (typeof avatarUrl === 'string' && avatarUrl) user.avatarUrl = avatarUrl;
        user.updateLabel(displayName, user.avatarUrl);
        return user;
      }
      return spawn(name, isDemo, false, undefined, displayName, avatarUrl);
    }

    function setState(user, state, duration) {
      user.state = state;
      user.start = now();
      user.until = user.start + duration;
      user.group.rotation.set(0, 0, 0);
      user.group.position.y = 0;
      if (state === 'walk') {
        const z = (user.home.z - 1.5) / 0.55;
        user.angleStart = Math.atan2(z, user.home.x);
        user.radius = Math.max(2, Math.hypot(user.home.x, z));
      }
    }

    function chooseWanderTarget(user) {
      let target = new THREE.Vector3();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        target = new THREE.Vector3(randomBetween(-4.7, 4.7), 0, randomBetween(-2.7, 3.7));
        let nearestDistance = Infinity;
        users.forEach((other) => {
          if (other === user) return;
          nearestDistance = Math.min(nearestDistance, target.distanceTo(other.group.position));
        });
        if (nearestDistance > 1.4) break;
      }
      return target;
    }

    function firework(position) {
      const count = 140;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const velocities = [];
      const color = new THREE.Color().setHSL(Math.random(), 1, 0.6);
      for (let i = 0; i < count; i += 1) {
        positions.set([position.x, position.y, position.z], i * 3);
        colors.set([color.r, color.g, color.b], i * 3);
        velocities.push(
          new THREE.Vector3(randomBetween(-1, 1), randomBetween(-1, 1), randomBetween(-1, 1))
            .normalize().multiplyScalar(randomBetween(2, 5)),
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      scene.add(points);
      fireworks.push({ points, velocities, positions, elapsed: 0 });
    }

    const giftActions = {
      ZOOM: (user) => {
        zoomUser = user;
        zoomUntil = now() + 3.5;
      },
      FLY_ZOOM: (user) => {
        user.born = now() - 1;
        setState(user, 'fly', FLY_ZOOM_DURATION);
        zoomUser = user;
        zoomUntil = now() + FLY_ZOOM_DURATION;
      },
      SANTO: (user) => setState(user, 'dance', 3),
      BREAKDANCE: (user) => setState(user, 'break', 5),
      'ĐI VÒNG': (user) => setState(user, 'walk', 7),
      'PHÁO HOA': (user) => {
        for (let i = 0; i < 4; i += 1) {
          const timer = setTimeout(() => {
            delayedEffects.delete(timer);
            firework(new THREE.Vector3(
              user.group.position.x + randomBetween(-2, 2),
              randomBetween(3, 6),
              user.group.position.z + randomBetween(-1, 1),
            ));
          }, i * 350);
          delayedEffects.add(timer);
        }
      },
      'ĐỔI NHÂN VẬT': (user) => {
        changeCharacter(user);
      },
    };

    function newName() {
      let name = pick(NAMES);
      if (users.has(name)) name += ` ${Math.random() * 99 | 0}`;
      return name;
    }

    function randomUser() {
      const names = [...users.keys()];
      return names.length ? pick(names) : newName();
    }

    function handleEvent(event) {
      if (!event?.user || typeof event.user !== 'string') {
        console.error('Bar Live event requires a string user name.', event);
        return;
      }
      const displayName = typeof event.displayName === 'string' && event.displayName
        ? event.displayName
        : event.user;
      const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl : '';
      if (event.type === 'join') {
        const isNew = !users.has(event.user);
        getUser(event.user, event.demo === true, displayName, avatarUrl);
        if (isNew) toast({ user: displayName, message: 'đã vào Bar' });
      } else if (event.type === 'comment') {
        const text = typeof event.text === 'string' ? event.text : '';
        const normalized = text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        if (event.isHost !== true) {
          const matchedEffect = getCommentEffect(text, sceneSettings.commentMappings);
          if (matchedEffect) {
            const user = getUser(event.user, event.demo === true, displayName, avatarUrl);
            giftActions[matchedEffect](user);
          } else if (normalized === 'hey' || normalized.includes('nhảy')) {
            const user = getUser(event.user, event.demo === true, displayName, avatarUrl);
            setState(user, 'dance', 6);
          } else if (users.has(event.user)) {
            getUser(event.user, event.demo === true, displayName, avatarUrl);
          }
        } else if (users.has(event.user)) {
          getUser(event.user, event.demo === true, displayName, avatarUrl);
        }
        toast({ user: displayName, message: `: ${text}` });
      } else if (event.type === 'like') {
        const user = getUser(event.user, event.demo === true, displayName, avatarUrl);
        const eventTime = now();
        if (sceneSettings.zoomOnLike
          && eventTime - user.lastLikeZoomAt >= LIKE_ZOOM_COOLDOWN) {
          zoomUser = user;
          zoomUntil = eventTime + DJ_ZOOM_DURATION;
          user.lastLikeZoomAt = eventTime;
        }
        const likeCount = Number.isFinite(event.likeCount) && event.likeCount > 0
          ? event.likeCount
          : 1;
        toast({ user: displayName, message: `thả tim ×${likeCount}` });
      } else if (event.type === 'gift') {
        const user = getUser(event.user, event.demo === true, displayName, avatarUrl);
        const giftName = typeof event.giftName === 'string' ? event.giftName : event.gift;
        const action = event.action || event.gift;
        toast({ user: displayName, message: `tặng ${giftName}`, gift: giftName });
        if (giftActions[action]) giftActions[action](user);
      }
      if (event.adminTest === true) {
        clearTimeout(adminTestTimers.get(event.user));
        const timer = setTimeout(() => {
          adminTestTimers.delete(event.user);
          removeUser(event.user);
        }, 10_000);
        adminTestTimers.set(event.user, timer);
      }
    }

    function startDemo() {
      clearInterval(demoTimer);
      if (!demoEnabled.current) return;
      demoTimer = setInterval(() => {
        const random = Math.random();
        const demoUserCount = [...users.values()].filter((user) => user.isDemo).length;
        if ((random < 0.35 || demoUserCount < 4) && demoUserCount < MAX_DEMO_USERS) {
          handleEvent({ type: 'join', user: newName(), demo: true });
        } else if (random < 0.75) handleEvent({ type: 'comment', user: randomUser(), text: 'hey' });
        else handleEvent({ type: 'gift', user: randomUser(), gift: pick(GIFTS) });
      }, 1100);
    }

    let demoTimer;
    api.current = {
      handleEvent,
      updateSettings: applySceneSettings,
      join: () => handleEvent({ type: 'join', user: newName() }),
      joinTen: () => {
        for (let i = 0; i < 10; i += 1) {
          const timer = setTimeout(() => {
            delayedEffects.delete(timer);
            handleEvent({ type: 'join', user: newName() });
          }, i * 120);
          delayedEffects.add(timer);
        }
      },
      hey: () => handleEvent({ type: 'comment', user: randomUser(), text: 'hey' }),
      gift: (gift) => handleEvent({ type: 'gift', user: randomUser(), gift }),
      toggleDemo: () => {
        demoEnabled.current = !demoEnabled.current;
        setDemo(demoEnabled.current);
        startDemo();
      },
    };
    window.handleEvent = handleEvent;

    BAR_NPCS.forEach(({ name, position }) => spawn(name, false, true, position));
    if (demoEnabled.current) {
      for (let i = 0; i < 6; i += 1) spawn(newName(), true);
    }
    startDemo();

    const cameraPosition = new THREE.Vector3(0, 4.2, 9);
    const lookTarget = new THREE.Vector3(0, 1.2, 0);
    const targetPosition = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    const spotlightTarget = new THREE.Vector3();
    const spotlightDown = new THREE.Vector3(0, -1, 0);
    let lastLedUpdate = 0;
    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let last = now();
    let frameId;
    function frame() {
      frameId = requestAnimationFrame(frame);
      const time = now();
      const delta = Math.min(0.05, time - last);
      last = time;
      const lightTime = time * sceneSettings.lightSpeed;
      const beat = time * 128 / 60;
      const energy = Math.pow(1 - (beat % 1), 3);

      danceVideos.forEach((visual) => {
        if (visual.video.paused || visual.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          || visual.video.currentTime === visual.lastVideoTime) return;
        visual.context.drawImage(visual.video, 0, 0, visual.canvas.width, visual.canvas.height);
        visual.texture.needsUpdate = true;
        visual.lastVideoTime = visual.video.currentTime;
      });
      tiles.forEach(([mesh, i, j]) => {
        mesh.material.color.setHSL(
          (time * 0.08 + (i + j) * 0.04) % 1,
          1,
          0.12 + energy * 0.22 * ((i + j) & 1 ? 1 : 0.4),
        );
      });
      bars.forEach((bar, i) => {
        bar.scale.y = 0.4 + Math.abs(Math.sin(i * 0.55 + time * 3))
          * 1.3 + energy * 1.6 * (0.5 + 0.5 * Math.sin(i * 1.7));
      });
      rings.forEach((ring, i) => {
        ring.rotation.y = time * 1.5 + i;
        ring.scale.setScalar(1 + energy * 0.12);
      });
      if (time - lastLedUpdate >= 1 / 20) {
        const gradient = ledContext.createLinearGradient(0, 0, ledCanvas.width, ledCanvas.height);
        gradient.addColorStop(0, '#170b33');
        gradient.addColorStop(0.5, '#080817');
        gradient.addColorStop(1, '#28102e');
        ledContext.fillStyle = gradient;
        ledContext.fillRect(0, 0, ledCanvas.width, ledCanvas.height);
        if (ledImage) {
          const imageScale = Math.max(ledCanvas.width / ledImage.width, ledCanvas.height / ledImage.height);
          const imageWidth = ledImage.width * imageScale;
          const imageHeight = ledImage.height * imageScale;
          ledContext.drawImage(
            ledImage,
            (ledCanvas.width - imageWidth) / 2,
            (ledCanvas.height - imageHeight) / 2,
            imageWidth,
            imageHeight,
          );
          ledContext.fillStyle = 'rgba(5,3,15,.35)';
          ledContext.fillRect(0, 0, ledCanvas.width, ledCanvas.height);
        }
        ledContext.fillStyle = 'rgba(255,255,255,.06)';
        for (let y = 0; y < ledCanvas.height; y += 5) ledContext.fillRect(0, y, ledCanvas.width, 1);
        ledContext.textAlign = 'center';
        ledContext.textBaseline = 'middle';
        ledContext.font = '900 72px system-ui,sans-serif';
        ledContext.shadowColor = '#ff3df2';
        ledContext.shadowBlur = 26;
        ledContext.fillStyle = '#fff';
        ledContext.fillText(sceneSettings.ledTitle, ledCanvas.width / 2, 115);
        ledContext.shadowBlur = 0;
        ledContext.font = 'bold 18px system-ui,sans-serif';
        ledContext.fillStyle = '#9bfaff';
        ledContext.fillText(sceneSettings.ledSubtitle, ledCanvas.width / 2, 172, ledCanvas.width - 48);
        for (let i = 0; i < 34; i += 1) {
          const height = 12 + Math.abs(Math.sin(time * 5 + i * 0.6)) * 45;
          const hue = (time * 48 + i * 12) % 360;
          ledContext.fillStyle = `hsla(${hue},100%,65%,.9)`;
          ledContext.fillRect(116 + i * 16, 268 - height, 8, height);
        }
        ledTexture.needsUpdate = true;
        lastLedUpdate = time;
      }
      djAccentMaterials[0].color.setHSL(0.52, 1, 0.62 + energy * 0.12);
      djAccentMaterials[1].color.setHSL(0.86, 1, 0.62 + energy * 0.12);
      djAccentMaterials.forEach((material) => {
        material.opacity = 0.8 + energy * 0.2;
      });
      djGlow.intensity = 1.8 + energy * 2;
      spotlights.forEach(({ pivot, side, phase }) => {
        spotlightTarget.set(
          Math.sin(lightTime * 0.95 + phase) * 5,
          0,
          Math.cos(lightTime * 0.72 + phase) * 3,
        );
        spotlightTarget.sub(pivot.position).normalize();
        pivot.quaternion.setFromUnitVectors(spotlightDown, spotlightTarget);
      });
      laserBeams.forEach(({ pivot, material, phase, spread, impact, sideIndex, beamIndex }) => {
        spotlightTarget.set(
          Math.sin(lightTime * 1.2 + phase) * 1.5 + spread,
          0.08 + Math.sin(lightTime * 1.5 + phase) * 0.3,
          Math.cos(lightTime * 0.85 + phase) * 1.2,
        );
        spotlightTarget.sub(pivot.position).normalize();
        pivot.quaternion.setFromUnitVectors(spotlightDown, spotlightTarget);
        if (beamIndex === 5) laserHeads[sideIndex].yoke.quaternion.copy(pivot.quaternion);
        material.opacity = 0.7 + Math.sin(lightTime * 5 + phase) ** 2 * 0.2;
        const floorDistance = pivot.position.y / -spotlightTarget.y;
        impact.position.set(
          pivot.position.x + spotlightTarget.x * floorDistance,
          0.045,
          pivot.position.z + spotlightTarget.z * floorDistance,
        );
        const pulse = 0.9 + Math.sin(lightTime * 7 + phase) * 0.14;
        impact.scale.set(pulse, pulse, 1);
      });
      if (time >= nextDjZoomAt) {
        djZoomUntil = time + DJ_ZOOM_DURATION;
        nextDjZoomAt = time + DJ_ZOOM_INTERVAL;
      }
      const zoomActive = zoomUser
        && time < zoomUntil
        && users.get(zoomUser.name) === zoomUser;
      const djZoomActive = !zoomActive && djCat.visible && time < djZoomUntil;
      users.forEach((user) => {
        const { group } = user;
        const opacityTarget = (zoomActive && user !== zoomUser) || djZoomActive ? 0.13 : 1;
        const opacityEase = Math.min(1, delta * 5);
        user.sprite.material.opacity += (opacityTarget - user.sprite.material.opacity) * opacityEase;
        user.label.material.opacity += (opacityTarget - user.label.material.opacity) * opacityEase;
        const age = time - user.born;
        const fallProgress = Math.min(1, age / 1.15);
        const fallOffset = user.dropHeight * (1 - fallProgress * fallProgress);
        const animatedVisual = Boolean(user.videoVisual);
        const entranceScale = !animatedVisual && age < 0.5
          ? (() => { const value = age / 0.5 - 1; return 1 + 2.7 * value ** 3 + 1.7 * value ** 2; })()
          : 1;
        if (user.state !== 'idle' && time > user.until) setState(user, 'idle', 0);
        const elapsed = time - user.start;
        if (user.state === 'fly') {
          const progress = Math.min(1, elapsed / (user.until - user.start));
          const rise = Math.min(1, progress / 0.25);
          const descend = progress > 0.72 ? (1 - progress) / 0.28 : 1;
          const lift = Math.max(0, rise * descend);
          group.position.x = user.home.x + Math.sin(elapsed * 2.5 + user.phase) * 0.16;
          group.position.z = user.home.z + Math.cos(elapsed * 2 + user.phase) * 0.12;
          group.position.y = FLY_HEIGHT * lift + Math.sin(time * 8 + user.phase) * 0.1 * lift;
          group.rotation.y = Math.sin(elapsed * 2 + user.phase) * 0.22;
          group.rotation.z = Math.sin(elapsed * 3 + user.phase) * 0.08;
          user.sprite.rotation.z = Math.sin(elapsed * 5 + user.phase) * 0.16;
          user.arms.forEach((arm) => {
            arm.rotation.z = arm.userData.side * (1.8 + Math.sin(elapsed * 7 + user.phase) * 0.35);
          });
        } else if (animatedVisual && user.state === 'idle') {
          if (time >= user.nextMoveAt) {
            user.moveTarget.copy(chooseWanderTarget(user));
            user.nextMoveAt = time + randomBetween(4, 8);
          }
          const previousX = group.position.x;
          const previousZ = group.position.z;
          const moveEase = 1 - Math.exp(-0.55 * delta);
          group.position.x += (user.moveTarget.x - group.position.x) * moveEase;
          group.position.z += (user.moveTarget.z - group.position.z) * moveEase;
          group.position.y = Math.abs(Math.sin(time * 5 + user.phase)) * 0.035;
          const directionX = group.position.x - previousX;
          const directionZ = group.position.z - previousZ;
          if (Math.hypot(directionX, directionZ) > 0.0001) {
            const targetRotation = Math.atan2(directionX, directionZ);
            group.rotation.y += Math.atan2(
              Math.sin(targetRotation - group.rotation.y),
              Math.cos(targetRotation - group.rotation.y),
            ) * Math.min(1, delta * 3);
          }
          user.sprite.rotation.z = Math.sin(time * 2 + user.phase) * 0.025;
          group.scale.setScalar(1);
        } else if (user.state === 'idle') {
          group.position.x = user.home.x + Math.sin(time * 3 + user.phase) * 0.08;
          group.position.z += (user.home.z - group.position.z) * delta * 3;
          group.position.y = Math.abs(Math.sin(time * 7 + user.phase)) * 0.12;
          group.rotation.y = Math.sin(time * 1.8 + user.phase) * 0.3;
          user.sprite.rotation.z = Math.sin(time * 5 + user.phase) * 0.13;
          group.scale.setScalar(Math.max(
            0.001,
            entranceScale * (1 + Math.abs(Math.sin(time * 7 + user.phase)) * 0.06),
          ));
          user.arms.forEach((arm) => {
            arm.rotation.z = arm.userData.side * (0.25 + Math.sin(time * 2 + user.phase) * 0.05);
          });
        } else if (user.state === 'dance') {
          const bounce = Math.abs(Math.sin(elapsed * 15 + user.phase));
          group.position.x = user.home.x + Math.sin(elapsed * 8 + user.phase) * 0.32;
          group.position.z = user.home.z + Math.cos(elapsed * 8 + user.phase) * 0.2;
          group.position.y = bounce * 0.88;
          group.rotation.y = Math.sin(elapsed * 7 + user.phase) * 1.05;
          user.sprite.rotation.z = Math.sin(elapsed * 15 + user.phase) * 0.3;
          group.scale.set(
            Math.max(0.001, entranceScale * (1 + bounce * 0.15)),
            Math.max(0.001, entranceScale * (1 + bounce * 0.22)),
            Math.max(0.001, entranceScale * (1 + bounce * 0.15)),
          );
          user.arms.forEach((arm, i) => {
            arm.rotation.z = arm.userData.side * (1.7 + Math.sin(elapsed * 8 + i * Math.PI) * 0.8);
          });
        } else if (user.state === 'break') {
          group.position.y = 0.35 + Math.abs(Math.sin(elapsed * 12)) * 0.38;
          group.rotation.x = -1.35;
          group.rotation.y = elapsed * 9;
          user.sprite.rotation.z = Math.sin(elapsed * 9) * 0.4;
          user.arms.forEach((arm, i) => {
            arm.rotation.z = arm.userData.side * (1.2 + Math.sin(elapsed * 10 + i));
          });
        } else if (user.state === 'walk') {
          const angle = user.angleStart + elapsed * 1.2;
          const x = Math.cos(angle) * user.radius;
          const z = Math.sin(angle) * user.radius * 0.55 + 1.5;
          group.rotation.y = Math.atan2(x - group.position.x, z - group.position.z);
          group.position.set(x, Math.abs(Math.sin(elapsed * 7)) * 0.1, z);
          user.sprite.rotation.z = Math.sin(elapsed * 7) * 0.12;
          user.arms.forEach((arm, i) => {
            arm.rotation.z = arm.userData.side * (0.4 + Math.sin(elapsed * 7 + i * Math.PI) * 0.4);
          });
        }
        group.position.y += fallOffset;
        if (user.state !== 'dance') group.scale.setScalar(Math.max(0.001, entranceScale));
        user.ring.position.x = group.position.x;
        user.ring.position.z = group.position.z;
        const ringPulse = 1 + Math.sin(time * 5 + user.phase) * 0.12;
        user.ring.scale.set(ringPulse, ringPulse, ringPulse);
        user.ring.rotation.z = time * 0.7 + user.phase;
        const ringDim = (zoomActive && user !== zoomUser) || djZoomActive ? 0.13 : 1;
        user.ringCore.material.opacity = (0.7 + Math.abs(Math.sin(time * 6 + user.phase)) * 0.3) * ringDim;
        user.ringHalo.material.opacity = (0.25 + Math.abs(Math.sin(time * 4 + user.phase)) * 0.35) * ringDim;
      });

      for (let i = fireworks.length - 1; i >= 0; i -= 1) {
        const effect = fireworks[i];
        effect.elapsed += delta;
        for (let j = 0; j < effect.velocities.length; j += 1) {
          const velocity = effect.velocities[j];
          velocity.y -= 4 * delta;
          effect.positions[j * 3] += velocity.x * delta;
          effect.positions[j * 3 + 1] += velocity.y * delta;
          effect.positions[j * 3 + 2] += velocity.z * delta;
        }
        effect.points.geometry.attributes.position.needsUpdate = true;
        effect.points.material.opacity = Math.max(0, 1 - effect.elapsed / 1.6);
        if (effect.elapsed > 1.6) {
          scene.remove(effect.points);
          effect.points.geometry.dispose();
          effect.points.material.dispose();
          fireworks.splice(i, 1);
        }
      }

      targetPosition.set(0, 5, 12.5);
      targetLook.set(0, 1.2, 0);
      if (zoomActive) {
        const position = zoomUser.group.position;
        const focusY = position.y + 0.9;
        targetPosition.set(position.x, focusY + 1.45, position.z + 3.2);
        targetLook.set(position.x, focusY, position.z);
      } else if (djZoomActive) {
        const catPosition = djCat.getWorldPosition(spotlightTarget);
        targetPosition.set(catPosition.x, catPosition.y + 1.1, catPosition.z + 4.5);
        targetLook.copy(catPosition);
      }
      const cameraEase = 1 - Math.exp(-7 * delta);
      cameraPosition.lerp(targetPosition, cameraEase);
      lookTarget.lerp(targetLook, cameraEase);
      camera.position.copy(cameraPosition);
      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    }
    frame();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearInterval(demoTimer);
      delayedEffects.forEach(clearTimeout);
      adminTestTimers.forEach(clearTimeout);
      adminTestTimers.clear();
      resizeObserver.disconnect();
      if (window.handleEvent === handleEvent) delete window.handleEvent;
      api.current = null;
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            material.map?.dispose();
            material.dispose();
          });
        }
      });
      danceVideos.forEach((visual) => {
        visual.texture.dispose();
      });
      danceVideoElements.forEach((video) => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
      ringGeometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [toast]);

  useEffect(() => {
    let disposed = false;
    let socket;
    let reconnectTimer;
    let reconnectDelay = 2000;

    function connectBridge() {
      if (disposed) return;
      socket = new WebSocket(getBridgeSocketUrl());
      socket.addEventListener('open', () => {
        if (disposed) {
          socket.close();
          return;
        }
        reconnectDelay = 2000;
        socket.send(JSON.stringify({ type: 'scene-ready' }));
      });
      socket.addEventListener('message', (message) => {
        if (disposed) return;
        let payload;
        try {
          payload = JSON.parse(message.data);
        } catch (error) {
          console.error('Invalid message from TikTok LIVE bridge:', error);
          return;
        }
        if (payload.type === 'status' && typeof payload.status === 'string') {
          setTikTokStatus(payload.status);
        } else if (payload.type === 'scene-settings' && payload.settings) {
          const settings = normalizeLiveSettings({
            ...liveSettings.current,
            ...payload.settings,
          });
          liveSettings.current = settings;
          setLiveHints(getLiveHints(settings));
          api.current?.updateSettings(settings);
        } else if (payload.type === 'event' && payload.event) {
          if (typeof window.handleEvent === 'function') window.handleEvent(payload.event);
        }
      });
      socket.addEventListener('close', () => {
        if (disposed) return;
        setTikTokStatus('disconnected');
        reconnectTimer = setTimeout(connectBridge, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      });
    }

    connectBridge();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      if (socket?.readyState === WebSocket.OPEN) socket.close();
    };
  }, []);

  useEffect(() => {
    function onAdminTestEvent(event) {
      if (event.key !== ADMIN_TEST_EVENT_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        if (payload?.event && typeof window.handleEvent === 'function') {
          window.handleEvent(payload.event);
        }
      } catch (error) {
        console.error('Unable to process Bar Live admin test event:', error);
      }
    }

    function onSettingsChange(event) {
      if (event.key !== LIVE_SETTINGS_KEY || !event.newValue) return;
      try {
        const settings = normalizeLiveSettings(JSON.parse(event.newValue));
        liveSettings.current = settings;
        setLiveHints(getLiveHints(settings));
        api.current?.updateSettings(settings);
      } catch (error) {
        console.error('Unable to apply updated Bar Live settings:', error);
      }
    }

    window.addEventListener('storage', onAdminTestEvent);
    window.addEventListener('storage', onSettingsChange);
    return () => {
      window.removeEventListener('storage', onAdminTestEvent);
      window.removeEventListener('storage', onSettingsChange);
    };
  }, []);

  useEffect(() => () => {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current.clear();
  }, []);

  return (
    <main className="fixed left-1/2 top-1/2 h-[min(100dvh,177.7778vw)] w-[min(100vw,56.25dvh)] -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[#05030f] text-[#f4f0ff] shadow-[0_0_60px_rgba(255,61,242,0.12)]">
      <div ref={canvasHost} className="absolute inset-0" aria-label="Mô phỏng sàn nhảy Bar Live, khung dọc 9:16" />

      <section className="pointer-events-none absolute inset-x-2 top-[calc(8px+env(safe-area-inset-top,0px))] z-10 flex flex-col gap-1" aria-live="polite">
        {feed.map((item) => (
          <div
            key={item.id}
            className="animate-[toast-out_4s_forwards] self-start rounded-full border border-white/15 bg-[rgba(18,10,38,.78)] px-3 py-1 text-[13px] backdrop-blur-md motion-reduce:animate-none"
          >
            <strong className="text-[#27e8ff]">{item.user}</strong> {item.message}
          </div>
        ))}
      </section>

      <aside className="pointer-events-none absolute right-2 top-[calc(52px+env(safe-area-inset-top,0px))] z-10 w-[42%] rounded-xl border border-[#27e8ff]/40 bg-[rgba(7,10,28,.72)] p-2 shadow-[0_0_22px_rgba(39,232,255,.16)] backdrop-blur-md" aria-live="polite">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black tracking-[.18em] text-[#27e8ff]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3df2]" />
          QUÀ TẶNG LIVE
        </div>
        {feed.some((item) => item.gift) ? (
          feed.filter((item) => item.gift).slice(-2).reverse().map((item) => (
            <div key={item.id} className="truncate text-[10px] leading-5 text-white">
              <span className="text-[#ffd23f]">✦</span> {item.user} gửi <strong className="text-[#ff8bdf]">{item.gift}</strong>
            </div>
          ))
        ) : (
          <div className="text-[9px] leading-4 text-white/55">Đang chờ quà từ người xem…</div>
        )}
      </aside>

      <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full border border-white/15 bg-[rgba(7,10,28,.72)] px-2 py-1 text-[9px] text-white/75 backdrop-blur-md">
        {tiktokStatus === 'connected' && 'TikTok LIVE: đã kết nối'}
        {tiktokStatus === 'connecting' && 'TikTok LIVE: đang kết nối…'}
        {tiktokStatus === 'reconnecting' && 'TikTok LIVE: đang kết nối lại…'}
        {tiktokStatus === 'offline' && 'TikTok LIVE: chưa live / đang thử lại'}
        {tiktokStatus === 'error' && 'TikTok LIVE: lỗi kết nối'}
        {tiktokStatus === 'not-configured' && 'TikTok LIVE: chưa cấu hình tài khoản'}
        {tiktokStatus === 'disconnected' && 'TikTok LIVE: mất kết nối cầu nối'}
      </div>

      {liveHints.some((hint) => hint.trigger || hint.effect) && (
        <aside
          className="pointer-events-none absolute bottom-2 right-2 z-10 flex max-w-[48%] flex-col items-stretch gap-1.5 rounded-2xl border border-[#ff8bdf]/35 bg-[rgba(18,10,38,.82)] p-2.5 text-[10px] font-semibold text-white shadow-[0_0_16px_rgba(255,139,223,.12)] backdrop-blur-md"
          aria-label="Gợi ý tương tác"
        >
          {liveHints.filter((hint) => hint.trigger || hint.effect).map((hint, index) => (
            <div className="flex items-center gap-1.5" key={`${index}-${hint.trigger}-${hint.effect}`}>
              <span aria-hidden="true" className="shrink-0">{hint.icon}</span>
              {hint.trigger && <span className="break-words">{hint.trigger}</span>}
              {hint.trigger && hint.effect && <span className="text-white/45">=</span>}
              {hint.effect && <span className="break-words text-[#ff8bdf]">{hint.effect}</span>}
            </div>
          ))}
        </aside>
      )}

    </main>
  );
}

function ControlButton({ active = false, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-lg border px-1.5 py-1.5 text-[11px] text-[#f4f0ff] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#27e8ff] ${
        active
          ? 'border-[#ff3df2] bg-[#ff3df2] text-white'
          : 'border-white/15 bg-white/[0.08] hover:bg-white/[0.18]'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
