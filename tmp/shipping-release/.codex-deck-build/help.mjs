import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const p = await PresentationFile.importPptx(await FileBlob.load(source));
console.log(await p.help("remove slide collection items slides delete", { search: true, include: "all", maxChars: 12000 }));
