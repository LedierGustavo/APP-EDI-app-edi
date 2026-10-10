// Marca o diretório dist-electron como CommonJS.
//
// O package.json raiz é "type": "module" (necessário para postcss/tailwind).
// Sem isso, os .js emitidos pelo tsc seriam interpretados como ESM e o Electron
// quebraria com "require is not defined"/"exports is not defined", pois o tsc
// emite CommonJS. Um package.json {"type":"commonjs"} dentro de dist-electron
// sobrepõe o raiz apenas nesse diretório, então os .js voltam a ser CJS.
//
// Também remove .cjs antigos (de builds anteriores que renomeavam main/preload).
import { writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const dir = "dist-electron";

if (!existsSync(dir)) {
  console.error(`[electron-cjs] diretório "${dir}" não existe. Rode o tsc primeiro.`);
  process.exit(1);
}

for (const name of readdirSync(dir)) {
  if (name.endsWith(".cjs")) rmSync(path.join(dir, name), { force: true });
}

writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);

console.log("[electron-cjs] dist-electron marcado como CommonJS.");
