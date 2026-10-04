import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  LANES,
  GOAL,
  RANGE,
  createRun,
  advance,
  apply,
  scan,
  observation,
  reference,
  seeded,
} from "./physics.mjs";
const $ = (id) => document.getElementById(id);
let run = createRun(),
  seed = 17,
  speed = 6,
  provider = "qwen",
  mode = "camera",
  extraDelay = 0,
  epoch = 0,
  pending = null,
  lastResponse = null,
  decisions = [],
  results = [],
  events = [],
  available = {},
  nextRequest = 0,
  wallStart = 0,
  lastWall = 0,
  cameraView = 0,
  notifiedEnd = false;
let preparing = false,
  warmupInfo = null,
  frames = [],
  lastFrameTime = -1;
const names = {
  openai: "GPT-4.1 mini",
  clef: "CLEF",
  qwen: "Qwen3-VL-30B MoE",
  jev: "Jev",
  llm: "Otro LLM",
  reference: "Reglas",
  manual: "Tú",
};
const actionNames = { LEFT: "← Izquierda", RIGHT: "Derecha →" };
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e2129);
scene.fog = new THREE.FogExp2(0x0e2129, 0.018);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$("world").append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(
    48,
    innerWidth / innerHeight,
    0.1,
    260,
  ),
  eye = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 80);
const imageTarget = new THREE.WebGLRenderTarget(640, 360);
imageTarget.texture.colorSpace = THREE.SRGBColorSpace;
const imageCanvas = document.createElement("canvas");
imageCanvas.width = 640;
imageCanvas.height = 360;
const imageContext = imageCanvas.getContext("2d");
scene.add(new THREE.HemisphereLight(0xd8f0fa, 0x122526, 2));
const sun = new THREE.DirectionalLight(0xd3ede3, 3);
sun.position.set(-10, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -18,
  right: 18,
  top: 25,
  bottom: -25,
  far: 65,
});
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);
const rim = new THREE.DirectionalLight(0x70ffc8, 1.5);
rim.position.set(10, 8, -20);
scene.add(rim);
const materials = {
  road: new THREE.MeshStandardMaterial({ color: 0x152b31, roughness: 0.8 }),
  rail: new THREE.MeshStandardMaterial({
    color: 0x41606a,
    metalness: 0.7,
    roughness: 0.4,
  }),
  wall: new THREE.MeshStandardMaterial({ color: 0xd7e0d6, roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({
    color: 0xec765a,
    emissive: 0xc95236,
    emissiveIntensity: 0.22,
  }),
  low: new THREE.MeshStandardMaterial({
    color: 0xf2b859,
    emissive: 0x8f4b06,
    emissiveIntensity: 0.2,
  }),
  mint: new THREE.MeshStandardMaterial({
    color: 0xb2f583,
    emissive: 0x82ec61,
    emissiveIntensity: 0.5,
  }),
  ink: new THREE.MeshStandardMaterial({
    color: 0x162629,
    metalness: 0.5,
    roughness: 0.3,
  }),
};
function box(w, h, d, mat) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    typeof mat === "string" ? materials[mat] : mat,
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const road = box(8.8, 0.25, 170, "road");
road.position.set(0, -0.16, -70);
scene.add(road);
for (const x of [-4.5, 4.5]) {
  const rail = box(0.15, 0.12, 165, "rail");
  rail.position.set(x, 0.04, -70);
  scene.add(rail);
  const strip = box(0.035, 0.018, 165, "mint");
  strip.position.set(x, 0.11, -70);
  scene.add(strip);
}
for (const x of [-1.2, 1.2])
  for (let z = 2; z > -137; z -= 4) {
    const dash = box(
      0.045,
      0.012,
      1.25,
      new THREE.MeshStandardMaterial({ color: 0x688080, roughness: 0.9 }),
    );
    dash.position.set(x, 0, z);
    scene.add(dash);
  }
const landscape = new THREE.Group();
scene.add(landscape);
const random = seeded(910);
for (let i = 0; i < 50; i++) {
  const side = i % 2 ? 1 : -1;
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.8 + random() * 3,
      2 + random() * 5,
      2 + random() * 12,
      5,
    ),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.53, 0.22, 0.08 + random() * 0.055),
      roughness: 1,
    }),
  );
  rock.position.set(side * (9 + random() * 20), -2, -random() * 170 + 12);
  rock.rotation.y = random() * 6;
  landscape.add(rock);
}
const base = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x10232a, roughness: 1 }),
);
base.rotation.x = -Math.PI / 2;
base.position.y = -0.7;
scene.add(base);
for (let z = -5; z > -125; z -= 12)
  for (const x of [-4, 4]) {
    const post = box(0.13, 2, 0.13, "rail");
    post.position.set(x, 0.3, z);
    scene.add(post);
    const lamp = box(0.2, 0.15, 0.2, "mint");
    lamp.position.set(x, 1.35, z);
    scene.add(lamp);
  }
const finishGate = new THREE.Group();
for (const x of [-4, 4]) {
  const pole = box(0.3, 5, 0.3, "mint");
  pole.position.set(x, 2.5, -GOAL);
  finishGate.add(pole);
}
const beam = box(8.3, 0.35, 0.3, "mint");
beam.position.set(0, 5, -GOAL);
finishGate.add(beam);
const textCanvas = document.createElement("canvas");
textCanvas.width = 512;
textCanvas.height = 128;
const tx = textCanvas.getContext("2d");
tx.fillStyle = "#c6ff99";
tx.font = "700 72px system-ui";
tx.textAlign = "center";
tx.fillText("120 m / META", 256, 90);
const label = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 1.25),
  new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(textCanvas),
    transparent: true,
    side: THREE.DoubleSide,
  }),
);
label.position.set(0, 4.2, -GOAL);
finishGate.add(label);
scene.add(finishGate);
const robot = new THREE.Group();
scene.add(robot);
const shell = new THREE.Mesh(
  new THREE.SphereGeometry(0.48, 32, 24),
  new THREE.MeshStandardMaterial({
    color: 0xe5ede4,
    metalness: 0.35,
    roughness: 0.3,
  }),
);
shell.castShadow = true;
shell.position.y = 0.49;
robot.add(shell);
const band = new THREE.Mesh(
  new THREE.TorusGeometry(0.465, 0.055, 10, 40),
  materials.ink,
);
band.position.y = 0.49;
band.rotation.y = Math.PI / 2;
robot.add(band);
const lidar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.18, 0.13, 24),
  materials.ink,
);
lidar.position.y = 1.02;
robot.add(lidar);
const scanLight = new THREE.Mesh(
  new THREE.TorusGeometry(0.182, 0.025, 8, 32),
  materials.mint,
);
scanLight.rotation.x = Math.PI / 2;
scanLight.position.y = 1.04;
robot.add(scanLight);
const eyeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.105, 12, 12),
  materials.mint,
);
eyeMesh.position.set(0, 0.57, -0.44);
robot.add(eyeMesh);
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 32),
  new THREE.MeshBasicMaterial({
    color: 0x020709,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.012;
scene.add(shadow);
let obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);
function buildCourse() {
  scene.remove(obstacleGroup);
  obstacleGroup.traverse((o) => o.geometry?.dispose());
  obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  for (const o of run.objects) {
    const group = new THREE.Group();
    group.position.set(o.x, 0, -o.z);
    const m = box(o.width, o.height, o.depth, "wall");
    m.position.y = o.height / 2;
    group.add(m);
    for (const x of [-o.width / 2 + 0.1, o.width / 2 - 0.1]) {
      const side = box(0.17, o.height, 0.025, "red");
      side.position.set(x, o.height / 2, o.depth / 2 + 0.017);
      group.add(side);
    }
    for (const y of [0.35, o.height - 0.3]) {
      const stripe = box(o.width - 0.1, 0.15, 0.025, "red");
      stripe.position.set(0, y, o.depth / 2 + 0.035);
      group.add(stripe);
    }
    const slit = box(0.5, 0.035, 0.03, "ink");
    slit.position.set(0, 1.35, o.depth / 2 + 0.04);
    group.add(slit);
    obstacleGroup.add(group);
  }
}
const lasers = new THREE.Group();
scene.add(lasers);
const laserLines = [];
for (let i = 0; i < 3; i++) {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const l = new THREE.Line(
    g,
    new THREE.LineBasicMaterial({
      color: 0xaef886,
      transparent: true,
      opacity: 0.55,
    }),
  );
  lasers.add(l);
  laserLines.push(l);
}
const pulse = new THREE.PointLight(0xb0ff7b, 1.5, 6);
pulse.position.set(0, 1, 0);
robot.add(pulse);
function resetScene() {
  buildCourse();
  robot.position.set(run.x, 0, 0);
  camera.position.set(10, 6.5, 9);
  camera.lookAt(0, 0.3, -19);
  updateSensors();
}
function updateSensors() {
  const beams = scan(run);
  for (let i = 0; i < 3; i++) {
    const label = ["left", "front", "right"][i],
      b = beams[i],
      node = $("range-" + label);
    node.innerHTML = b.range_m.toFixed(1) + "<small>m</small>";
    node.parentElement.classList.toggle("danger", b.range_m < 8);
    node.parentElement.classList.toggle("current-lane", i === run.targetLane);
    const points = laserLines[i].geometry.attributes.position;
    points.setXYZ(0, LANES[i], 0.55, -run.z - 0.1);
    points.setXYZ(1, LANES[i], 0.55, -run.z - b.range_m);
    points.needsUpdate = true;
  }
  lasers.visible = mode === "laser" && run.status !== "crashed";
  $("distance").textContent = Math.min(GOAL, run.z).toFixed(1) + " / 120 m";
  $("progress-fill").style.width = (run.z / GOAL) * 100 + "%";
}

function captureCamera() {
  eye.position.set(run.x, 0.82 + run.y, -run.z - 0.12);
  eye.lookAt(run.x, 0.9, -run.z - 20);
  const previousVisible = robot.visible;
  robot.visible = false;
  lasers.visible = false;
  renderer.setRenderTarget(imageTarget);
  renderer.render(scene, eye);
  const pixels = new Uint8Array(640 * 360 * 4);
  renderer.readRenderTargetPixels(imageTarget, 0, 0, 640, 360, pixels);
  renderer.setRenderTarget(null);
  robot.visible = previousVisible;
  lasers.visible = mode === "laser";
  const output = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < 360; y++)
    output.set(pixels.subarray(y * 2560, (y + 1) * 2560), (359 - y) * 2560);
  imageContext.putImageData(new ImageData(output, 640, 360), 0, 0);
  return imageCanvas.toDataURL("image/jpeg", 0.82).split(",")[1];
}
function notice(text) {
  $("notice").textContent = text;
  $("notice").classList.add("show");
  setTimeout(() => $("notice").classList.remove("show"), 3500);
}
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
function modelLabel() {
  return lastResponse?.model || names[provider];
}
function switchState() {
  document.body.classList.toggle("running", run.status === "running");
  document.body.classList.toggle("ready", run.status === "ready");
  $("intro").classList.toggle("hidden", run.status !== "ready");
  $("run-controls").classList.toggle("hidden", run.status !== "running");
  $("camera-preview").classList.toggle("hidden", mode !== "camera");
  $("sensor-strip").classList.toggle("hidden", mode !== "laser");
  $("model-button").disabled = run.status !== "ready" || !!pending || preparing;
  $("retry").disabled = $("change-model").disabled = !!pending;
  $("retry").textContent = pending ? "Esperando respuesta…" : "Misma pista ↻";
  $("laser-mode").disabled = $("camera-mode").disabled = run.status !== "ready";
  $("settings-button").disabled = run.status !== "ready";
  $("seed-label").textContent = seed;
}
function updateAvailability() {
  const origins = {
    clef: "DGX SPARK · NVFP4",
    qwen: "DGX SPARK · FP8 · NVIDIA",
    openai: "OPENAI API",
    jev: "TYPESAFE API · SOLO TEXTO",
    llm: "API COMPATIBLE",
    reference: "CONTROL PROGRAMADO",
    manual: "CONTROL MANUAL",
  };
  $("selected-model").textContent = names[provider];
  $("model-origin").textContent = origins[provider];
  $("model-detail").textContent =
    mode === "camera" ? "Cámara · 640 × 360" : "LiDAR plano · 3 distancias";
  const ok = ["manual", "reference"].includes(provider) || available[provider];
  $("connected").classList.toggle("on", !!ok);
  $("ready-note").textContent = ok
    ? provider === "reference"
      ? "Control de referencia programado · sin IA"
      : provider === "manual"
        ? "Flechas ← y → para elegir carril"
        : mode === "camera"
          ? "El modelo verá solo la cámara frontal."
          : "El modelo recibirá solo las distancias del láser."
    : ["clef", "qwen"].includes(provider)
      ? "Modelo apagado. Puedes cargarlo en el DGX."
      : "Modelo sin conexión. Abre ⚙ para configurarlo.";
  $("start").disabled = !ok || preparing;
  $("warmup").disabled = !ok || preparing;
  $("warmup").classList.toggle(
    "hidden",
    ["manual", "reference"].includes(provider),
  );
  $("activate").classList.toggle(
    "hidden",
    ok || !available.localControl || !["clef", "qwen"].includes(provider),
  );
  $("activate").disabled = !!available.loading;
  $("activate").textContent = available.loading
    ? "Preparando DGX…"
    : "Cargar este modelo en DGX";
  if (available.loading)
    $("ready-note").textContent =
      "Cambiando modelo. El arranque puede tardar unos minutos.";
  else if (available.loadError)
    $("ready-note").textContent = available.loadError;
}
async function refreshStatus() {
  try {
    available = await (await fetch("/api/status")).json();
    if (available.openaiName)
      names.openai = available.openaiName.replace("-2025-04-14", "");
    $("model-name").textContent = names[provider];
    updateAvailability();
  } catch {
    $("ready-note").textContent = "Servidor local sin conexión";
  }
}
function selectProvider(value) {
  if (run.status !== "ready" || pending || preparing) return;
  provider = value;
  warmupInfo = null;
  $("warmup").textContent = "Preparar modelo";
  $("latency").innerHTML = "— <small>ms</small>";
  $("last-action").textContent = "—";
  $("waiting").textContent = "Listo para arrancar";
  $("age").textContent = "Sin respuestas todavía";
  $("last-image").removeAttribute("src");
  $("model-name").textContent = names[value];
  $("models").classList.add("hidden");
  if (["jev", "reference"].includes(provider) && mode === "camera")
    setMode("laser");
  updateAvailability();
}
function setMode(value) {
  if (run.status === "running" || pending || preparing) return;
  if (value === "camera" && ["jev", "reference"].includes(provider)) {
    notice("Este controlador usa distancias. Selecciona un modelo visual.");
    return;
  }
  mode = value;
  $("laser-mode").classList.toggle("active", mode === "laser");
  $("camera-mode").classList.toggle("active", mode === "camera");
  switchState();
  updateAvailability();
}
function start() {
  if (preparing) return;
  if (pending) {
    notice("Esperando a que termine la petición anterior.");
    return;
  }
  epoch++;
  $("models").classList.add("hidden");
  run = createRun(seed, speed);
  run.status = "running";
  pending = null;
  lastResponse = null;
  decisions = [];
  events = [];
  frames = [];
  lastFrameTime = -1;
  wallStart = performance.now();
  lastWall = wallStart;
  nextRequest = wallStart;
  notifiedEnd = false;
  buildCourse();
  $("result").classList.add("hidden");
  $("latency").innerHTML = "— <small>ms</small>";
  $("last-action").textContent =
    actionNames[run.lastAction] || "Sin orden todavía";
  $("age").textContent = "Avance automático";
  $("waiting").textContent = "Tomando la primera lectura";
  $("trace-line").textContent =
    `PISTA ${seed} · ${speed} m/s · ${mode.toUpperCase()} · RETRASO AÑADIDO ${extraDelay} ms`;
  switchState();
  if (provider !== "manual") ask();
}
function chosen(action) {
  apply(run, action);
  $("last-action").textContent = actionNames[action];
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => b.classList.toggle("active", b.dataset.action === action));
}
function snapshot() {
  return {
    version: "lidar-run/2",
    course_version: 3,
    prompt_version: 5,
    seed,
    speed,
    provider,
    mode,
    added_delay_ms: extraDelay,
    model: modelLabel(),
    distance_m: +run.z.toFixed(2),
    status: run.status,
    elapsed_s: +run.time.toFixed(3),
    latency_definition:
      "request capture to client response incl. transport and added delay; median of applied decisions only",
    median_latency_ms: median(
      decisions.filter((d) => d.applied).map((d) => d.round_trip_ms),
    ),
    warmup: warmupInfo,
    recorded_at: new Date().toISOString(),
    collision: run.collision,
    events,
    frames,
    decisions,
  };
}
async function save() {
  const data = snapshot();
  try {
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
}
function finish() {
  if (notifiedEnd) return;
  notifiedEnd = true;
  const pendingAtImpact = pending
    ? {
        requested_at_m: pending.z,
        age_ms: Math.round(performance.now() - pending.started),
        sensors: pending.sensors,
      }
    : null;
  events.push({
    type: run.status,
    time_s: run.time,
    z: run.z,
    pending: pendingAtImpact,
    last_action: run.lastAction,
  });
  const completed = run.status === "finished";
  $("result-tag").textContent = completed
    ? "META ALCANZADA"
    : run.status === "stopped"
      ? "CARRERA TERMINADA"
      : "IMPACTO";
  $("result-title").textContent = completed
    ? "Llegó a tiempo."
    : run.status === "stopped"
      ? "Tú detuviste la prueba."
      : pending
        ? "Impacto. Veamos la decisión."
        : "Esa acción no evitó el obstáculo.";
  const last = decisions.filter((d) => d.applied).at(-1);
  const front = last?.sensors?.lidar?.[last.sensors.lane];
  const destination = last?.sensors
    ? Math.max(
        0,
        Math.min(
          2,
          last.sensors.lane + (last.response.action === "LEFT" ? -1 : 1),
        ),
      )
    : null;
  const destinationRange =
    destination === null ? null : last.sensors.lidar[destination].range_m;
  const obstacle = "obstáculo";
  $("result-reason").textContent = completed
    ? "120 metros, mismas reglas. Cambia de modelo y repite esta pista."
    : run.status === "stopped"
      ? "La carrera se detuvo. Puedes repetir la misma pista."
      : `Impacto con ${obstacle}. Última orden aplicada: ${actionNames[run.lastAction] || "Sin orden todavía"}. ` +
        (last
          ? `Tardó ${last.round_trip_ms} ms` +
            (front
              ? ` y ordenó ir al carril ${["izquierdo", "central", "derecho"][destination]}, cuya lectura era ${destinationRange} m.`
              : ".")
          : "No se recibió ninguna decisión a tiempo.") +
        (pending
          ? ` Otra petición seguía pendiente (${pendingAtImpact.age_ms} ms; ${(run.z - pending.z).toFixed(1)} m recorridos desde su lectura).`
          : "");
  $("result-distance").textContent = run.z.toFixed(1) + " m";
  $("result-latency").textContent =
    (median(decisions.filter((d) => d.applied).map((d) => d.round_trip_ms)) ??
      "—") + " ms";
  $("result-calls").textContent = decisions.filter((d) => d.applied).length;
  $("crash-detail").textContent = JSON.stringify(
    {
      impacto: run.collision,
      esperando_respuesta: pendingAtImpact,
      ultima_decision: decisions.filter((d) => d.response).at(-1) || null,
    },
    null,
    2,
  );
  $("result").classList.remove("hidden");
  results.push({
    provider: names[provider],
    mode,
    seed,
    speed,
    extraDelay,
    distance: run.z,
    latency: median(
      decisions.filter((d) => d.applied).map((d) => d.round_trip_ms),
    ),
  });
  $("ranking").replaceChildren();
  for (const r of results
    .filter(
      (r) =>
        r.mode === mode &&
        r.seed === seed &&
        r.speed === speed &&
        r.extraDelay === extraDelay,
    )
    .slice(-4)) {
    const div = document.createElement("div");
    div.className = "rank";
    const a = document.createElement("span"),
      b = document.createElement("span");
    a.textContent = r.provider + " · " + r.mode;
    b.textContent =
      r.distance.toFixed(1) + " m / " + (r.latency ?? "—") + " ms";
    div.append(a, b);
    $("ranking").append(div);
  }
  switchState();
  if (!pending) save();
}
async function ask() {
  if (pending || run.status !== "running" || provider === "manual") return;
  const currentEpoch = epoch,
    started = performance.now(),
    sensors = mode === "laser" ? observation(run) : null;
  const image = mode === "camera" ? captureCamera() : null;
  if (image) $("last-image").src = "data:image/jpeg;base64," + image;
  const entry = {
    id: decisions.length + 1,
    started_s: run.time,
    z: run.z,
    started,
    robot_pose: { x: run.x, z: run.z, targetLane: run.targetLane },
    sensors,
    image_mode: mode === "camera",
    image_base64: image,
    response: null,
  };
  pending = entry;
  decisions.push(entry);
  try {
    let result;
    if (provider === "reference") {
      const action = reference(structuredClone(run));
      await new Promise((r) => setTimeout(r, 100 + extraDelay));
      result = { action, model: "scripted-reference", latency_ms: 100 };
    } else {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          mode,
          sensors,
          image,
          last_latency_ms: lastResponse?.round_trip_ms ?? 0,
          speed,
        }),
      });
      result = await res.json();
      if (!res.ok) throw Error(result.error);
      if (extraDelay) await new Promise((r) => setTimeout(r, extraDelay));
    }
    if (currentEpoch !== epoch) return;
    const received = performance.now();
    if (run.status === "running") {
      advance(run, (received - lastWall) / 1000);
      lastWall = received;
      if (run.status !== "running") finish();
    }
    entry.response = result;
    entry.round_trip_ms = Math.round(received - started);
    entry.received_wall_s = (received - wallStart) / 1000;
    entry.received_s = run.time;
    entry.received_z = run.z;
    entry.applied = run.status === "running";
    lastResponse = { ...result, round_trip_ms: entry.round_trip_ms };
    $("latency-label").textContent = entry.applied
      ? "ÚLTIMA RESPUESTA"
      : "RESPUESTA TARDÍA";
    $("latency").innerHTML = entry.round_trip_ms + " <small>ms</small>";
    $("waiting").textContent =
      "Respondió · " + (run.z - entry.z).toFixed(1) + " m recorridos";
    $("age").textContent = "Lectura de hace " + entry.round_trip_ms + " ms";
    if (run.status === "running") chosen(result.action);
    else {
      events.push({
        type: "late_response",
        action: result.action,
        latency_ms: entry.round_trip_ms,
      });
      $("result-reason").textContent +=
        " La respuesta pendiente llegó después: " +
        actionNames[result.action] +
        " (" +
        entry.round_trip_ms +
        " ms).";
    }
  } catch (error) {
    if (currentEpoch !== epoch) return;
    entry.error = error.message;
    entry.round_trip_ms = Math.round(performance.now() - started);
    $("waiting").textContent = "Error: sin acción nueva";
    notice(error.message);
    events.push({
      type: "provider_error",
      message: error.message,
      time_s: run.time,
    });
  } finally {
    if (currentEpoch === epoch) {
      pending = null;
      nextRequest = performance.now() + 100;
      switchState();
      if (notifiedEnd) {
        $("crash-detail").textContent = JSON.stringify(
          snapshot(),
          (k, v) =>
            k === "image_base64" && v
              ? "[Imagen guardada en el archivo de datos]"
              : v,
          2,
        );
        save();
      }
    }
  }
}
function tick(now) {
  requestAnimationFrame(tick);
  if (run.status === "running") {
    const elapsed = (now - lastWall) / 1000;
    lastWall = now;
    advance(run, elapsed);
    if (run.time - lastFrameTime >= 1 / 60 || run.status !== "running") {
      frames.push({
        t: run.time,
        x: run.x,
        z: run.z,
        lane: run.targetLane,
        action: run.lastAction,
        status: run.status,
      });
      lastFrameTime = run.time;
    }
    if (run.status !== "running") finish();
    else if (!pending && now >= nextRequest) ask();
    if (pending) {
      $("latency").innerHTML =
        Math.round(now - pending.started) + " <small>ms</small>";
      $("latency-label").textContent = "ESPERANDO RESPUESTA";
      $("waiting").textContent =
        "+" + (run.z - pending.z).toFixed(1) + " m mientras espera";
    } else $("latency-label").textContent = "ÚLTIMA RESPUESTA";
  }
  robot.position.set(run.x, run.y, -run.z);
  shell.rotation.x = -run.z * 1.8;
  band.rotation.x = -run.z * 1.8;
  scanLight.rotation.z = now * 0.004;
  shadow.position.set(run.x, 0.012, -run.z);
  shadow.scale.setScalar(1 + run.y * 0.25);
  shadow.material.opacity = 0.35 / (1 + run.y);
  sun.position.set(run.x - 10, 25, -run.z + 10);
  sun.target.position.set(run.x, 0, -run.z - 8);
  if (run.status !== "ready") {
    const desired = cameraView
      ? new THREE.Vector3(run.x + 8, 6, -run.z + 7)
      : new THREE.Vector3(run.x * 0.45, 5.1, -run.z + 8.5);
    camera.position.lerp(desired, 0.065);
    camera.lookAt(run.x * 0.5, 0.5, -run.z - 13);
  }
  updateSensors();
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
$("warmup").onclick = async () => {
  if (preparing || run.status !== "ready") return;
  preparing = true;
  switchState();
  updateAvailability();
  $("warmup").textContent = "Preparando…";
  const sent = performance.now();
  try {
    const img = mode === "camera" ? captureCamera() : null;
    if (img) $("last-image").src = "data:image/jpeg;base64," + img;
    const r = await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        mode,
        image: img,
        sensors: mode === "laser" ? observation(run) : null,
        speed,
        last_latency_ms: 0,
      }),
    });
    const answer = await r.json();
    if (!r.ok) throw Error(answer.error);
    warmupInfo = {
      provider,
      mode,
      latency_ms: Math.round(performance.now() - sent),
      model: answer.model,
    };
    notice("Modelo preparado. Esta consulta no mueve el robot.");
    $("warmup").textContent = "✓ Preparado";
  } catch (e) {
    notice(e.message);
    $("warmup").textContent = "Preparar modelo";
  } finally {
    preparing = false;
    switchState();
    updateAvailability();
  }
};
for (const type of ["openai", "jev"])
  $("check-" + type).onclick = async () => {
    const out = $("connection-check");
    out.textContent = "Comprobando la clave guardada…";
    try {
      const r = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: type }),
      });
      const data = await r.json();
      out.textContent = r.ok ? "Conexión " + type + " verificada." : data.error;
    } catch {
      out.textContent = "No se pudo conectar.";
    }
  };
$("activate").onclick = async () => {
  const r = await fetch("/api/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  if (!r.ok) notice((await r.json()).error);
  await refreshStatus();
};
$("model-button").onclick = () => $("models").classList.toggle("hidden");
document
  .querySelectorAll("[data-model]")
  .forEach((b) => (b.onclick = () => selectProvider(b.dataset.model)));
$("laser-mode").onclick = () => setMode("laser");
$("camera-mode").onclick = () => setMode("camera");
$("track-button").onclick = () => {
  seed = seed === 17 ? 31 : seed === 31 ? 73 : 17;
  run = createRun(seed, speed);
  resetScene();
  switchState();
};
$("speed").onchange = (e) => {
  speed = Number(e.target.value);
  run = createRun(seed, speed);
};
$("extra-delay").onchange = (e) => (extraDelay = Number(e.target.value));
$("start").onclick = $("retry").onclick = start;
$("stop").onclick = () => {
  run.status = "stopped";
  finish();
};
$("view").onclick = () => (cameraView = 1 - cameraView);
$("change-model").onclick = () => {
  if (pending) return;
  epoch++;
  pending = null;
  run = createRun(seed, speed);
  $("result").classList.add("hidden");
  resetScene();
  switchState();
  $("models").classList.remove("hidden");
};
$("settings-button").onclick = () => $("settings").showModal();
$("close-settings").onclick = () => $("settings").close();
$("connection-form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const r = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    notice((await r.json()).error);
    return;
  }
  e.target.reset();
  $("settings").close();
  await refreshStatus();
  notice("Conexiones guardadas en este PC.");
};
for (const b of document.querySelectorAll("[data-action]"))
  b.onclick = () => {
    if (provider === "manual" && run.status === "running")
      chosen(b.dataset.action);
  };
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || $("settings").open) return;
  const action = { ArrowLeft: "LEFT", ArrowRight: "RIGHT" }[e.key];
  if (action) {
    e.preventDefault();
    if (provider === "manual" && run.status === "running" && !e.repeat)
      chosen(action);
  }
});
$("export").onclick = () => {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot(), null, 2)], {
        type: "application/json",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `lidar-run-${provider}-${mode}-${seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && run.status === "running") {
    run.status = "stopped";
    events.push({
      type: "tab_hidden",
      note: "Run stopped to avoid background timer throttling",
    });
    finish();
  }
});
resetScene();
selectProvider(provider);
setMode(mode);
switchState();
refreshStatus();
setInterval(refreshStatus, 4000);
