import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const snapshot = await presentation.inspect({ kind: "slide,textbox,shape,image,table,chart,notes,layout", maxChars: 20000 });
await fs.writeFile(path.join(".codex-deck-build", "template-inspect.ndjson"), snapshot.ndjson ?? String(snapshot));
console.log(`slides=${presentation.slides.items.length}`);
console.log(snapshot.ndjson ?? snapshot);
