import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const buildDir = "C:/SOFTWARE/supports_tectronic/.codex-deck-build";
const source = path.join(buildDir, "cotizador-envios-presentacion.pptx");
const outDir = path.join(buildDir, "rendered");
await fs.mkdir(outDir, { recursive: true });
const p = await PresentationFile.importPptx(await FileBlob.load(source));
const montage = await p.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(path.join(outDir, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));
for (let i = 0; i < p.slides.items.length; i += 1) {
  const slideImage = await p.slides.items[i].export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await slideImage.arrayBuffer()));
}
console.log(`RENDERED=${outDir}`);
