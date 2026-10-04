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
const worlds = runs.map((r) => {
  const w = createReplayWorld(1280, 1600);
  w.load(r.seed, r.speed);
  return w;
});
const duration = 2 + Math.max(...runs.map((r) => r.elapsed_s)) + 5;
let exporting = false,
  playing = false;
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
  ctx.fillStyle = "#08171c";
  ctx.fillRect(0, 0, 3840, 2160);
  txt("Qwen / GPT / CLEF", 65, 83, 48, "#f1f6f3", 650);
  txt("VISIÓN  ·  PISTA 17  ·  6 m/s  ·  META 120 m", 2210, 78, 33, "#9fb7b3");
  const t = Math.max(0, time - 2);
  for (let i = 0; i < 3; i++) {
    const x = i * 1280,
      r = runs[i],
      s = at(r, t),
      ended = t >= r.elapsed_s;
    worlds[i].render(s);
    ctx.drawImage(worlds[i].canvas, x, 300);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + 46, 138, 7, 109);
    txt(titles[i], x + 77, 186, 50, "#eef5f1", 650);
    txt(subtitles[i], x + 78, 236, 30, "#9bb5ad");
    txt("IMAGEN ENVIADA A LA IA", x + 66, 464, 26, "#a6c0b7", 600);
    const sent = sentImageAt(r, sentImages[i], t);
    if (sent) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(x + 64, 483, 644, 364);
      ctx.drawImage(sent, x + 66, 485, 640, 360);
    }
    const grad = ctx.createLinearGradient(0, 1330, 0, 2030);
    grad.addColorStop(0, "#08171c00");
    grad.addColorStop(1, "#08171c");
    ctx.fillStyle = grad;
    ctx.fillRect(x, 1330, 1280, 700);
    const latest = r.decisions
        .filter((d) => d.applied && d.received_s <= t)
        .at(-1),
      pending = r.decisions.find(
        (d) => d.started_s <= t && d.started_s + d.round_trip_ms / 1000 > t,
      );
    txt(
      time < 2
        ? "PREPARADO"
        : ended
          ? r.status === "finished"
            ? "META ALCANZADA"
            : "IMPACTO"
          : "EN MARCHA",
      x + 62,
      363,
      25,
      ended && r.status !== "finished" ? "#ffac8e" : colors[i],
      650,
    );
    const dist = ended ? r.distance_m : s.z;
    txt(dist.toFixed(1), x + 63, 1515, 102, "#ffffff", 550);
    txt("/ 120 m", x + 365, 1514, 37, "#9ab6b0");
    txt(
      latest
        ? latest.response.action === "LEFT"
          ? "← IZQUIERDA"
          : "DERECHA →"
        : "SIN RESPUESTA AÚN",
      x + 66,
      1600,
      45,
      colors[i],
      600,
    );
    const waiting = !ended && pending;
    const ms = waiting
      ? Math.max(0, Math.round((t - pending.started_s) * 1000))
      : latest?.round_trip_ms;
    txt(
      waiting ? "ESPERANDO RESPUESTA" : "ÚLTIMA DECISIÓN APLICADA",
      x + 68,
      1670,
      23,
      "#8daaa3",
    );
    txt(ms === undefined ? "—" : ms + " ms", x + 67, 1731, 43, "#e6eee8");
    ctx.fillStyle = "#53716855";
    ctx.fillRect(x + 66, 1791, 1148, 5);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + 66, 1791, 1148 * Math.min(1, dist / 120), 5);
    if (ended) {
      txt(
        "Mediana " + (r.median_latency_ms ?? "—") + " ms",
        x + 66,
        1870,
        33,
        "#a9beb7",
      );
      txt(
        r.decisions.filter((d) => d.applied).length + " decisiones aplicadas",
        x + 66,
        1923,
        28,
        "#8ca49b",
      );
    } else
      txt(
        "t = " + Math.min(t, r.elapsed_s).toFixed(1) + " s",
        x + 66,
        1880,
        33,
        "#a9beb7",
      );
    if (i < 2) {
      ctx.fillStyle = "#59766c55";
      ctx.fillRect(x + 1278, 125, 2, 1850);
    }
  }
}
render(0);
status.textContent =
  "Pista 17 · Cámara · 6 m/s · " + duration.toFixed(1) + " s";
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
          "Exportando 4K · " + Math.round((n / frames) * 100) + "%";
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
    link.download = "qwen-gpt-clef-vision-4k.mp4";
    link.hidden = false;
    status.textContent = "Vídeo 4K listo";
  } catch (e) {
    await fetch("/api/video/cancel", { method: "POST" }).catch(() => {});
    status.textContent = "Error: " + e.message;
  } finally {
    exporting = false;
    document.getElementById("render-button").disabled = false;
    document.getElementById("preview-button").disabled = false;
  }
};
