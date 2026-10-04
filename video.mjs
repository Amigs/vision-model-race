import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
let job = null;
export async function videoRoute(req, res, url, { root, config, json, read }) {
  if (!url.pathname.startsWith("/api/video/")) return false;
  if (req.method !== "POST") {
    json(res, 405, { error: "POST required" });
    return true;
  }
  if (url.pathname === "/api/video/start") {
    const body = await read(req, 1000),
      frames = Number(body.frames);
    if (!Number.isInteger(frames) || frames < 1 || frames > 1800)
      throw Error("Entre 1 y 1800 fotogramas");
    if (job) throw Error("Ya hay una exportación");
    await fs.mkdir(path.join(root, "recordings"), { recursive: true });
    const name = "comparison-" + Date.now() + ".mp4",
      file = path.join(root, "recordings", name),
      bin = process.env.FFMPEG_PATH || config.ffmpegPath || "ffmpeg";
    const proc = spawn(
      bin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        "30",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        file,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    const current = {
      proc,
      name,
      file,
      expected: frames,
      count: 0,
      error: null,
    };
    job = current;
    proc.stderr.on("data", (b) => {
      current.error = String(b).slice(-500);
    });
    proc.stdin.on("error", (e) => {
      current.error = e.message;
    });
    current.done = new Promise((resolve) => {
      proc.once("error", (e) => {
        current.error = e.message;
        resolve(-1);
      });
      proc.once("close", resolve);
    });
    json(res, 200, { ok: true });
    return true;
  }
  if (!job) throw Error("No hay exportación activa");
  if (url.pathname === "/api/video/frame") {
    if (job.error) throw Error("Codificador: " + job.error);
    if (job.count >= job.expected) throw Error("Demasiados fotogramas");
    const parts = [];
    let size = 0;
    for await (const b of req) {
      size += b.length;
      if (size > 6 * 1024 ** 2) throw Error("Fotograma demasiado grande");
      parts.push(b);
    }
    const buffer = Buffer.concat(parts);
    if (buffer[0] !== 255 || buffer[1] !== 216) throw Error("Se requiere JPEG");
    await new Promise((resolve, reject) =>
      job.proc.stdin.write(buffer, (e) => (e ? reject(e) : resolve())),
    );
    job.count++;
    json(res, 200, { count: job.count });
    return true;
  }
  if (url.pathname === "/api/video/finish") {
    const current = job;
    if (current.count !== current.expected) throw Error("Faltan fotogramas");
    current.proc.stdin.end();
    const code = await current.done;
    job = null;
    if (code !== 0) throw Error("No se pudo codificar el vídeo");
    json(res, 200, {
      url: "/recordings/" + current.name,
      frames: current.count,
    });
    return true;
  }
  if (url.pathname === "/api/video/cancel") {
    job.proc.kill("SIGTERM");
    job = null;
    json(res, 200, { ok: true });
    return true;
  }
  json(res, 404, { error: "Ruta desconocida" });
  return true;
}
