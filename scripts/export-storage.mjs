import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const baseUrl = process.env.ATDEV_CLOUD_URL;
const token = process.env.ATDEV_TOKEN;
const [project, outputArg] = process.argv.slice(2);
if (!baseUrl || !token || !project) {
  console.error("Usage: ATDEV_CLOUD_URL=https://... ATDEV_TOKEN=... node scripts/export-storage.mjs <project> [output-directory]");
  process.exit(1);
}
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(project)) throw new Error("Invalid project slug.");
const origin = new URL(baseUrl);
if (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") {
  throw new Error("ATDEV_CLOUD_URL must use HTTPS except for local development.");
}
const headers = { authorization: "Bearer " + token };
const manifestResponse = await fetch(new URL("/v1/projects/" + project + "/files/export", origin), { headers });
if (!manifestResponse.ok) throw new Error("Could not export manifest: HTTP " + manifestResponse.status);
const manifest = await manifestResponse.json();
if (manifest.format !== "atdev-storage-manifest/v1" || !Array.isArray(manifest.files)) {
  throw new Error("Unsupported AtDev Storage manifest.");
}
const outputDir = resolve(outputArg || ("atdev-storage-" + project));
await mkdir(outputDir, { recursive: true });
let downloaded = 0;
for (const file of manifest.files) {
  const downloadUrl = new URL(file.download_path, origin);
  if (downloadUrl.origin !== origin.origin) throw new Error("Manifest contains an external download URL.");
  const response = await fetch(downloadUrl, { headers });
  if (!response.ok) throw new Error("Download failed for " + file.id + ": HTTP " + response.status);
  const name = String(file.name || "file").replace(/[\/\\]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) || "file";
  const target = resolve(outputDir, file.id + "-" + basename(name));
  if (!target.startsWith(outputDir + sep)) throw new Error("Unsafe export path.");
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  downloaded += 1;
  process.stdout.write("Downloaded " + downloaded + "/" + manifest.files.length + ": " + name + "\n");
}
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write("Export complete: " + downloaded + " files -> " + outputDir + "\n");
