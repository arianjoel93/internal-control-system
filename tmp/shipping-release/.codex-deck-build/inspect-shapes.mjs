import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const p = await PresentationFile.importPptx(await FileBlob.load(source));
const slide = p.slides.items[0];
for (const shape of slide.shapes.items) {
  console.log({id:shape.id, name:shape.name, text:String(shape.text), textObj:Object.keys(shape.text ?? {}), proto:shape.toProto?.()});
}
