import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";
import type { StaffProjectionDto } from "./staffProjection";

function accidentalToken(alter: number): string | null {
  if (alter === 0) return null;
  if (alter === 1) return "#";
  if (alter === -1) return "b";
  if (alter === 2) return "##";
  if (alter === -2) return "bb";
  return null;
}

export function renderStaffProjection(container: HTMLDivElement, projection: StaffProjectionDto): () => void {
  container.replaceChildren();
  if (projection.notes.length === 0) return () => container.replaceChildren();

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(160, 88);
  const context = renderer.getContext();
  const stave = new Stave(4, 12, 150).addClef("treble");
  stave.setContext(context).draw();

  const note = new StaveNote({ keys: projection.notes.map((item) => item.vexKey), duration: "w" });
  projection.notes.forEach((item, index) => {
    const token = accidentalToken(item.alter);
    if (token) note.addModifier(new Accidental(token), index);
  });
  const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables([note]);
  new Formatter().joinVoices([voice]).format([voice], 95);
  voice.draw(context, stave);

  return () => container.replaceChildren();
}
