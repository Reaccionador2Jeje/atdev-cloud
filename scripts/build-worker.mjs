import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const html = await readFile(resolve(root, "public/index.html"), "utf8");
const template = await readFile(resolve(root, "src/worker.template.js"), "utf8");
if (!template.includes("__ATDEV_INDEX_HTML__")) throw new Error("Worker template is missing the HTML placeholder.");
const output = template.replace("__ATDEV_INDEX_HTML__", JSON.stringify(html));
const destination = resolve(root, "dist/worker.mjs");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, output, "utf8");
console.log("Built Cloudflare Worker: dist/worker.mjs");
