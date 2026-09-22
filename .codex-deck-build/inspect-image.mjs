import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const p = await PresentationFile.importPptx(await FileBlob.load(source));
const img = p.slides.items[0].images.items[0];
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(img)), Object.keys(img));
console.log({frame:img.frame, fit:img.fit, crop:img.crop, alt:img.alt, proto:img.toProto?.()});
