// Renomeia os arquivos compilados do main/preload de .js para .cjs.
// Substitui o antigo script PowerShell (Move-Item), que não roda em Linux/macOS.
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const dir = "dist-electron";
const pairs = [
  ["main.js", "main.cjs"],
  ["preload.js", "preload.cjs"],
];

for (const [from, to] of pairs) {
  const src = path.join(dir, from);
  const dest = path.join(dir, to);
  if (!existsSync(src)) continue;
  if (existsSync(dest)) rmSync(dest, { force: true });
  renameSync(src, dest);
  console.log(`[fix-electron-ext] ${from} -> ${to}`);
}
