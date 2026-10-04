import { execFileSync } from "node:child_process";
import fs from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const prohibited =
  /^(?:\.local\/|\.connections\.json$|start\.local\.sh$|\.env$|\.ssh\/|runs\/|recordings\/)|(?:id_rsa|id_ed25519|\.pem$)/;
const token =
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}|-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE) .*KEY-----/;
const problems = [];
for (const file of files) {
  if (
    prohibited.test(file) ||
    (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") ||
    file.endsWith(".key") ||
    file.startsWith(".model-cache/")
  ) {
    problems.push(file + ": archivo privado");
    continue;
  }
  if (file === "scripts/check-public.mjs") continue;
  const text = fs.readFileSync(file, "utf8");
  if (token.test(text)) problems.push(file + ": posible credencial");
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `Revisión pública: ${files.length} archivos, sin configuraciones privadas ni claves detectadas.`,
);
