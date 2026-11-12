import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const p = await PresentationFile.importPptx(await FileBlob.load(source));
const slide = p.slides.items[0];
for (const shape of slide.shapes.items) {
  if (shape.text?.length) console.log(shape.text, JSON.stringify(shape.text.style));
}
console.log('size', p.slideSize ?? p.frame, slide.frame);
