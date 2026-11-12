import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const source = "C:/Users/Johana/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/assets/reference.pptx";
const p = await PresentationFile.importPptx(await FileBlob.load(source));
const slide = p.slides.items[0];
for (const [name, value] of Object.entries({ slides:p.slides, slide, shapes:slide.shapes, images:slide.images, tables:slide.tables, charts:slide.charts })) {
  console.log(name, Object.getOwnPropertyNames(Object.getPrototypeOf(value)), Object.keys(value));
}
