import { videoRoute } from "./video.mjs";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
let config = {
  clefUrl: "http://127.0.0.1:8080",
  qwenUrl: "http://127.0.0.1:8000/v1",
  qwenModel: "default",
  qwenLabel: "Qwen",
  qwenKey: "",
  openaiKey: "",
  openaiModel: "gpt-4.1-mini-2025-04-14",
  jevKey: "",
  jevModel: "jev-1.13.0",
  llmUrl: "",
  llmModel: "",
  llmKey: "",
};
try {
  Object.assign(
    config,
    JSON.parse(await fs.readFile(path.join(ROOT, ".connections.json"), "utf8")),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
for (const [env, key] of Object.entries({
  OPENAI_API_KEY: "openaiKey",
  OPENAI_MODEL: "openaiModel",
  TYPESAFE_API_KEY: "jevKey",
  QWEN_URL: "qwenUrl",
  QWEN_MODEL: "qwenModel",
  QWEN_API_KEY: "qwenKey",
  CLEF_URL: "clefUrl",
}))
  if (process.env[env]) config[key] = process.env[env];
let localControl = null;
try {
  localControl = (await import("./.local/model-control.mjs")).createControl(
    config,
  );
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
let loading = null,
  loadError = null;
const allowed = ["LEFT", "RIGHT"];
export const ACTION_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "robot_action",
    strict: true,
    schema: {
      type: "object",
      properties: { action: { type: "string", enum: ["LEFT", "RIGHT"] } },
      required: ["action"],
      additionalProperties: false,
    },
  },
};
export const RULES = `Choose the safest lane for a robot moving forward continuously toward a goal 120 meters away. There are THREE lanes: LEFT (0), CENTER (1), RIGHT (2), but only TWO actions. LEFT moves ONE lane left; RIGHT moves ONE lane right. Repeating an outward action at the edge stays at that edge. Between responses the robot holds its chosen lane. There is no jumping, stopping or STRAIGHT action. A complete lane change takes 0.30 seconds. Movement continues while you respond. In LASER mode you get a planar 2D scan: one distance in meters for each lane. 26 means no obstacle detected within 26 meters. Use the distance in your current path; select a clear adjacent lane to avoid an approaching obstacle. At the left edge LEFT maintains that lane; at the right edge RIGHT maintains that lane. Avoid unnecessary oscillation. Readings belong to request time; the robot advances during inference. In CAMERA mode use only the attached forward image; no laser readings are supplied. Choose LEFT or RIGHT.`;
export function laserText(s, last) {
  const laneNames = ["LEFT", "CENTER", "RIGHT"];
  return (
    `Speed: ${s.speed_m_s} m/s. Current target lane: ${laneNames[s.lane]}. Currently changing lane: ${s.lateral_transition ? "yes" : "no"}. Planar laser distances: ` +
    s.lidar
      .map(
        (b) =>
          `${laneNames[b.lane]} lane${b.lane === s.lane ? " (current path)" : ""} distance=${b.range_m} m`,
      )
      .join("; ") +
    `. Previous response latency: ${last} ms.`
  );
}
const actions = {
  LEFT: "Move ONE lane to the left; hold position if already at the left edge.",
  RIGHT:
    "Move ONE lane to the right; hold position if already at the right edge.",
};

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function read(req, max = 3 * 1024 ** 2) {
  let n = 0,
    parts = [];
  for await (const b of req) {
    n += b.length;
    if (n > max) throw Error("Payload demasiado grande");
    parts.push(b);
  }
  return JSON.parse(Buffer.concat(parts));
}
async function post(url, payload, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("Modelo: HTTP " + r.status);
  return r.json();
}
export function parseAction(value) {
  const text = String(value ?? "").trim();
  if (allowed.includes(text)) return text;
  try {
    const o = JSON.parse(text);
    if (allowed.includes(o.action)) return o.action;
  } catch {}
  throw Error("El modelo no devolvió una acción válida: " + text.slice(0, 100));
}
export async function decide(data) {
  const {
    provider,
    mode,
    sensors,
    image,
    last_latency_ms = 0,
    speed = 6,
  } = data;
  if (!["laser", "camera"].includes(mode)) throw Error("Modo inválido");
  if (mode === "laser" && (!sensors || !Array.isArray(sensors.lidar)))
    throw Error("Falta la lectura láser");
  if (
    mode === "camera" &&
    (typeof image !== "string" || image.length > 1500000)
  )
    throw Error("Falta la imagen de cámara");
  if (provider === "jev" && mode === "camera")
    throw Error("Jev solo admite texto: selecciona Láser");
  const state =
    mode === "laser"
      ? { mode: "LASER", readings: laserText(sensors, last_latency_ms) }
      : { mode: "CAMERA", speed_m_s: speed, last_latency_ms };
  let action,
    model,
    probabilities = null,
    usage = null;
  const started = performance.now();
  if (provider === "clef" || provider === "jev") {
    if (provider === "jev" && !config.jevKey)
      throw Error("Conecta tu clave de Jev en ajustes");
    const body = {
      model: provider === "clef" ? "clef" : config.jevModel,
      state,
      questions: {
        action: { type: "choice", instructions: RULES, criteria: actions },
      },
    };
    if (mode === "camera") body.images_base64 = [image];
    const r = await post(
      provider === "clef"
        ? config.clefUrl + "/v1/systemone"
        : "https://api.typesafe.ai/v1/systemone",
      body,
      provider === "jev" ? { Authorization: "Bearer " + config.jevKey } : {},
    );
    action = parseAction(r.answers?.action?.choice);
    probabilities = r.answers?.action?.probabilities;
    model = r.served_model || r.model;
    usage = r.usage;
  } else if (["qwen", "llm", "openai"].includes(provider)) {
    const base =
      provider === "openai"
        ? "https://api.openai.com/v1"
        : provider === "qwen"
          ? config.qwenUrl
          : config.llmUrl;
    model =
      provider === "openai"
        ? config.openaiModel
        : provider === "qwen"
          ? config.qwenModel
          : config.llmModel;
    const key =
      provider === "openai"
        ? config.openaiKey
        : provider === "qwen"
          ? config.qwenKey
          : config.llmKey;
    if (provider === "openai" && !key)
      throw Error("Falta la clave de OpenAI en ajustes");
    if (!base || !model)
      throw Error("Configura la conexión del LLM en ajustes");
    const content =
      mode === "camera"
        ? [
            { type: "text", text: JSON.stringify(state) },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64," + image },
            },
          ]
        : JSON.stringify(state);
    const r = await post(
      base.replace(/\/$/, "") + "/chat/completions",
      {
        model,
        messages: [
          {
            role: "system",
            content:
              RULES +
              " Action definitions: " +
              JSON.stringify(actions) +
              " Return JSON with the single action field: LEFT or RIGHT. No explanation.",
          },
          { role: "user", content },
        ],
        temperature: 0,
        max_tokens: 32,
        ...(provider === "qwen" || provider === "openai"
          ? { response_format: ACTION_FORMAT }
          : {}),
      },
      key ? { Authorization: "Bearer " + key } : {},
    );
    action = parseAction(r.choices?.[0]?.message?.content);
    usage = r.usage;
    if (provider === "openai") model = r.model || model;
  } else throw Error("Proveedor desconocido");
  if (provider === "qwen") model = config.qwenLabel || model;
  return {
    action,
    model,
    probabilities,
    usage,
    prompt_version: 5,
    latency_ms: Math.round(performance.now() - started),
    mode,
  };
}
async function status() {
  const out = {
    loading,
    loadError,
    localControl: !!localControl,
    openai: !!config.openaiKey,
    openaiName: config.openaiModel,
    qwenName: config.qwenLabel,
    clef: false,
    qwen: false,
    jev: !!config.jevKey,
    llm: !!(config.llmUrl && config.llmModel),
    llmName: config.llmModel,
    clefName: null,
  };
  await Promise.allSettled([
    fetch(config.clefUrl + "/health", {
      signal: AbortSignal.timeout(1200),
    }).then(async (r) => {
      if (r.ok) {
        out.clef = true;
        out.clefName = (await r.json()).model;
      }
    }),
    fetch(config.qwenUrl + "/models", {
      headers: config.qwenKey
        ? { Authorization: "Bearer " + config.qwenKey }
        : {},
      signal: AbortSignal.timeout(1200),
    }).then((r) => {
      out.qwen = r.ok;
    }),
  ]);
  return out;
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const port = process.env.PORT || 4180;
    if (!["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host))
      return json(res, 403, { error: "Host no permitido" });
    if (req.method === "POST") {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return json(res, 403, { error: "Origen no permitido" });
      if (await videoRoute(req, res, u, { root: ROOT, config, json, read }))
        return;
      if (u.pathname === "/api/activate") {
        if (!localControl)
          throw Error("No hay un controlador de modelos local configurado");
        const { provider } = await read(req, 1000);
        if (!["clef", "qwen"].includes(provider))
          throw Error("Proveedor inválido");
        if (loading) throw Error("Ya hay un modelo cargándose");
        loading = provider;
        loadError = null;
        localControl(provider)
          .catch(() => {
            loadError =
              "No se pudo cargar el modelo. Revisa el controlador local.";
          })
          .finally(() => {
            loading = null;
          });
        return json(res, 202, { ok: true });
      }
      if (u.pathname === "/api/decide")
        return json(res, 200, await decide(await read(req)));
      if (u.pathname === "/api/check") {
        const { provider } = await read(req, 1000);
        if (!["openai", "jev"].includes(provider))
          throw Error("Proveedor inválido");
        const key = provider === "openai" ? config.openaiKey : config.jevKey;
        if (!key) throw Error("Guarda primero la clave");
        const url =
          provider === "openai"
            ? "https://api.openai.com/v1/models/" +
              encodeURIComponent(config.openaiModel)
            : "https://api.typesafe.ai/v1/models";
        const answer = await fetch(url, {
          headers: { Authorization: "Bearer " + key },
          signal: AbortSignal.timeout(15000),
        });
        if (!answer.ok)
          throw Error("Comprobación de acceso: HTTP " + answer.status);
        return json(res, 200, { ok: true, provider });
      }
      if (u.pathname === "/api/config") {
        const data = await read(req, 8000);
        if (data.llmUrl && !/^https?:\/\//.test(data.llmUrl.trim()))
          throw Error("La URL debe comenzar por http:// o https://");
        for (const key of [
          "jevKey",
          "jevModel",
          "openaiKey",
          "openaiModel",
          "llmUrl",
          "llmModel",
          "llmKey",
          "qwenUrl",
          "qwenModel",
          "qwenLabel",
          "qwenKey",
          "clefUrl",
        ])
          if (typeof data[key] === "string" && data[key].trim())
            config[key] = data[key].trim();
        if (config.llmUrl && !/^https?:\/\//.test(config.llmUrl))
          throw Error("La URL debe comenzar por http:// o https://");
        await fs.writeFile(
          path.join(ROOT, ".connections.json"),
          JSON.stringify(config, null, 2),
          { mode: 0o600 },
        );
        return json(res, 200, { ok: true });
      }
      if (u.pathname === "/api/run") {
        const data = await read(req, 16 * 1024 ** 2);
        if (!Array.isArray(data.decisions) || data.decisions.length > 1000)
          throw Error("Partida inválida");
        const id =
          new Date().toISOString().replace(/[:.]/g, "-") +
          "-" +
          randomUUID().slice(0, 6);
        await fs.mkdir(path.join(ROOT, "runs"), { recursive: true });
        await fs.writeFile(
          path.join(ROOT, "runs", id + ".json"),
          JSON.stringify(data, null, 2),
        );
        return json(res, 200, { id });
      }
      return json(res, 404, { error: "Ruta desconocida" });
    }
    if (req.method !== "GET")
      return json(res, 405, { error: "Método no permitido" });
    if (u.pathname === "/api/status") return json(res, 200, await status());
    if (/^\/recordings\/comparison-[0-9]+\.mp4$/.test(u.pathname)) {
      const media = await fs.readFile(path.join(ROOT, u.pathname.slice(1)));
      res.writeHead(200, { "Content-Type": "video/mp4" });
      res.end(media);
      return;
    }
    const vendor = u.pathname.startsWith("/vendor/"),
      base = path.join(ROOT, vendor ? "node_modules/three" : "public"),
      file = path.resolve(
        base,
        "." +
          (vendor
            ? u.pathname.slice(7)
            : u.pathname === "/"
              ? "/index.html"
              : decodeURIComponent(u.pathname)),
      );
    if (!file.startsWith(base + path.sep))
      return json(res, 403, { error: "Acceso denegado" });
    const content = await fs.readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  } catch (e) {
    json(res, e.code === "ENOENT" ? 404 : 400, {
      error:
        e.name === "TimeoutError"
          ? "La petición superó 30 segundos"
          : e.message,
    });
  }
});
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  server.listen(Number(process.env.PORT || 4180), "127.0.0.1", () =>
    console.log("Model comparison → http://127.0.0.1:4180"),
  );
