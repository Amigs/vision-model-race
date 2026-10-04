import { loadSentImages, sentImageAt } from "./camera-frames.mjs";
import { createReplayWorld } from "./replay-world.mjs";
import { createRun } from "./physics.mjs";
const canvas = document.getElementById("preview"),
  ctx = canvas.getContext("2d", { alpha: false }),
  status = document.getElementById("state");
const runs = await (await fetch("/comparison/runs.json")).json();
const sentImages = await loadSentImages(runs);
const colors = ["#8fbcff", "#d0f589", "#efa0ff"],
  titles = ["Qwen3-VL-30B", "GPT-4.1 mini", "CLEF"],
  subtitles = ["MoE · FP8 · DGX Spark", "API OpenAI", "NVFP4 · DGX Spark"];
const world = createReplayWorld(1080, 1260);
const intro = 1.5,
  hold = 2.5,
  segments = runs.map((r) => intro + r.elapsed_s + hold),
  duration = segments.reduce((a, b) => a + b, 0);
let exporting = false,
  playing = false,
  current = -1;
function txt(text, x, y, size = 36, color = "#e1eee9", weight = 500) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui`;
  ctx.fillText(text, x, y);
}
function at(r, t) {
  const f = r.frames;
  const end = Math.min(t, r.elapsed_s);
  let lo = 0,
    hi = f.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (f[mid].t <= end) lo = mid;
    else hi = mid - 1;
  }
  const a = end < f[0].t ? { t: 0, x: 0, z: 0 } : f[lo],
    b = end < f[0].t ? f[0] : f[lo + 1] || a,
    alpha =
      b.t === a.t ? 0 : Math.max(0, Math.min(1, (end - a.t) / (b.t - a.t)));
  return {
    ...createRun(r.seed, r.speed),
    x: a.x + (b.x - a.x) * alpha,
    z: a.z + (b.z - a.z) * alpha,
    time: end,
    status: t >= r.elapsed_s ? r.status : "running",
  };
}

function render(time) {
  let i = 0,
    local = time;
  while (i < runs.length - 1 && local >= segments[i]) {
    local -= segments[i];
    i++;
  }
  const r = runs[i],
    t = Math.max(0, Math.min(local - intro, r.elapsed_s)),
    ended = local >= intro + r.elapsed_s,
    ready = local < intro,
    s = at(r, t);
  if (current !== i) {
    world.load(r.seed, r.speed);
    current = i;
  }
  world.render(s);
  ctx.fillStyle = "#08171c";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.drawImage(world.canvas, 0, 290);
  ctx.fillStyle = colors[i];
  ctx.fillRect(50, 73, 6, 142);
  txt("VISIÓN · 3 CARRILES · 2 DECISIONES", 79, 80, 27, "#a3b8b0", 600);
  txt(titles[i], 78, 153, 67, "#f1f6f3", 700);
  txt(subtitles[i], 81, 206, 32, "#a3b8b0");
  txt(i + 1 + " / 3", 941, 81, 30, colors[i], 650);
  txt("PISTA 17   ·   6 m/s   ·   META 120 m", 55, 269, 29, "#abc0b7");
  const dist = ended ? r.distance_m : s.z;
  const top = ctx.createLinearGradient(0, 290, 0, 485);
  top.addColorStop(0, "#08171cf5");
  top.addColorStop(1, "#08171c00");
  ctx.fillStyle = top;
  ctx.fillRect(0, 290, 1080, 195);
  txt(dist.toFixed(1) + " m", 54, 383, 76, "#ffffff", 650);
  const phase = ready
    ? "PREPARADO"
    : ended
      ? r.status === "finished"
        ? "META ALCANZADA"
        : "IMPACTO"
      : "EN MARCHA";
  txt(
    phase,
    625,
    375,
    29,
    ended && r.status !== "finished" ? "#ffac8e" : colors[i],
    650,
  );
  txt("IMAGEN ENVIADA A LA IA", 55, 463, 27, "#b2c9bf", 600);
  const sent = sentImageAt(r, sentImages[i], t);
  if (sent) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(53, 483, 644, 364);
    ctx.drawImage(sent, 55, 485, 640, 360);
  }
  const grad = ctx.createLinearGradient(0, 1400, 0, 1570);
  grad.addColorStop(0, "#08171c00");
  grad.addColorStop(1, "#08171c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 1400, 1080, 170);
  const latest = r.decisions
      .filter((d) => d.applied && d.received_s <= t)
      .at(-1),
    pending = r.decisions.find(
      (d) => d.started_s <= t && d.started_s + d.round_trip_ms / 1000 > t,
    );
  const waiting = !ready && !ended && pending;
  txt(ended ? "ÚLTIMA DECISIÓN" : "DECISIÓN", 55, 1595, 25, "#9bb5ac", 600);
  txt(
    latest
      ? latest.response.action === "LEFT"
        ? "← IZQUIERDA"
        : "DERECHA →"
      : "SIN ORDEN",
    55,
    1663,
    57,
    colors[i],
    650,
  );
  txt(
    ended ? "LATENCIA MEDIANA" : waiting ? "ESPERANDO" : "RESPUESTA",
    686,
    1595,
    24,
    "#9bb5ac",
    600,
  );
  const ms = ended
    ? Math.round(r.median_latency_ms)
    : waiting
      ? Math.round((t - pending.started_s) * 1000)
      : latest?.round_trip_ms;
  txt(ms === undefined ? "—" : ms + " ms", 685, 1663, 52, "#f2f6f3", 600);
  ctx.fillStyle = "#53716855";
  ctx.fillRect(55, 1720, 970, 6);
  ctx.fillStyle = colors[i];
  ctx.fillRect(55, 1720, 970 * Math.min(1, dist / 120), 6);
  const lane = ["izquierdo", "central", "derecho"][r.collision?.lane];
  if (ended)
    txt(
      r.status === "finished"
        ? "120 metros · meta alcanzada"
        : "Choque en el carril " + lane,
      55,
      1790,
      35,
      "#d2e2da",
      550,
    );
}
render(0);
status.textContent =
  "Vertical 1080×1920 · " + duration.toFixed(1) + " s · Qwen → GPT → CLEF";
document.getElementById("preview-button").onclick = () => {
  if (exporting) return;
  playing = true;
  const start = performance.now();
  function frame() {
    const t = (performance.now() - start) / 1000;
    render(Math.min(t, duration));
    if (t < duration && playing) requestAnimationFrame(frame);
  }
  frame();
};
document.getElementById("render-button").onclick = async () => {
  if (exporting) return;
  playing = false;
  exporting = true;
  document.getElementById("render-button").disabled = true;
  document.getElementById("preview-button").disabled = true;
  try {
    const frames = Math.ceil(duration * 30);
    let r = await fetch("/api/video/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames }),
    });
    if (!r.ok) throw Error((await r.json()).error);
    for (let n = 0; n < frames; n++) {
      render(n / 30);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.98),
      );
      r = await fetch("/api/video/frame", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!r.ok) throw Error((await r.json()).error);
      if (n % 5 === 0)
        status.textContent =
          "Exportando vertical · " + Math.round((n / frames) * 100) + "%";
    }
    status.textContent = "Finalizando MP4…";
    r = await fetch("/api/video/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw Error((await r.json()).error);
    const d = await r.json(),
      link = document.getElementById("download");
    link.href = d.url;
    link.download = "qwen-gpt-clef-linkedin-vertical.mp4";
    link.hidden = false;
    status.textContent = "Vídeo vertical listo";
  } catch (e) {
    await fetch("/api/video/cancel", { method: "POST" }).catch(() => {});
    status.textContent = "Error: " + e.message;
  } finally {
    exporting = false;
    document.getElementById("render-button").disabled = false;
    document.getElementById("preview-button").disabled = false;
  }
};
