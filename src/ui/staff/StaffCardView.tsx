import { useEffect, useRef } from "react";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import { renderStaffProjection } from "../../notation/vexflowAdapter";

export function StaffCardView({ pitches }: { readonly pitches: readonly ExactPitch[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const projection = projectPitchesToStaff(pitches);
  useEffect(() => {
    if (!ref.current) return;
    return renderStaffProjection(ref.current, projection);
  }, [projection]);
  return <div ref={ref} className="mini-staff" aria-label={`Staff realization: ${projection.notes.map((note) => `${note.step}${note.octave}`).join(", ")}`} />;
}
