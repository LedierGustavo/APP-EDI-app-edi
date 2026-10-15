import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const folderName = `${pkg.build.productName}-Portable-Pasta-${pkg.version}`;
const release = "release";
const unpacked = path.join(release, "win-unpacked");
const staged = path.join(release, folderName);
const zipPath = path.join(release, `${folderName}.zip`);
const defaultZip = path.join(release, `${pkg.build.productName}-${pkg.version}-win.zip`);

if (!fs.existsSync(unpacked)) throw new Error(`Pasta não encontrada: ${unpacked}. Rode o build do zip antes.`);

fs.rmSync(staged, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.cpSync(unpacked, staged, { recursive: true });

execFileSync("tar.exe", ["-a", "-c", "-f", zipPath, "-C", release, folderName], { stdio: "inherit" });

fs.rmSync(staged, { recursive: true, force: true });
fs.rmSync(defaultZip, { force: true });
console.log(`[make-zip] ${zipPath}`);
