import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { rational } from "../../../src/domain/timing/rational";
import { musicalDuration } from "../../../src/domain/timing/duration";
import {
  applyAuthoredMelodyTransaction,
  restoreAuthoredMelodyTransaction,
} from "../../../src/app/commands/authoredMelodyTransaction";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import { writeMusicXml } from "../../../src/export/musicxml/writer";

const pitch = exactPitch(64, { step: "E", alter: 0 });
const note = (id: string) => ({ id, pitch, onset: rational(0), duration: rational(1) });
const fixture = (notes = [note("a"), note("b")]) => {
  const base = createDefaultProject("acceptance");
  return {
    ...base,
    progression: {
      ...base.progression,
      steps: [
        {
          id: "owner",
          kind: "rest" as const,
          duration: musicalDuration(rational(4)),
          authoredMelody: { notes },
        },
      ],
    },
  };
};

describe("independent Piano Roll batch 1 acceptance", () => {
  it("allows editing equal phrase-local IDs in different owner Steps atomically", () => {
    const base = fixture([note("same")]);
    const first = base.progression.steps[0]!;
    const project = {
      ...base,
      progression: { ...base.progression, steps: [first, { ...first, id: "other" }] },
    };
    const result = applyAuthoredMelodyTransaction(project, {
      type: "melody/apply-authored-transaction",
      payload: {
        nowIso: project.updatedAt,
        edits: [
          { type: "delete", sourceStepId: "owner", noteId: "same" },
          { type: "delete", sourceStepId: "other", noteId: "same" },
        ],
      },
    });
    expect(
      result.project.progression.steps.every(
        (step) => step.kind === "rest" && step.authoredMelody?.notes.length === 0,
      ),
    ).toBe(true);
  });
  it("exports simultaneous identical-pitch notes without rejecting valid polyphony", async () => {
    const xml = writeMusicXml(projectProjectToMusicXml(fixture()));
    const libxml = await import("libxmljs2");
    expect(() => libxml.parseXml(xml)).not.toThrow();
    const part = xml.match(/<part id="P2">([\s\S]*?)<\/part>/)?.[1] ?? "";
    const measure = part.match(/<measure\b[^>]*>([\s\S]*?)<\/measure>/)?.[1] ?? "";
    let cursor = 0;
    const starts: { voice: string; onset: number; duration: number; pitch: string }[] = [];
    for (const [token] of measure.matchAll(/<(backup|forward|note)\b[^>]*>[\s\S]*?<\/\1>/g)) {
      const name = token.match(/^<(\w+)/)?.[1];
      if (name === "backup") cursor -= Number(token.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0);
      else if (name === "forward")
        cursor += Number(token.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0);
      else if (name === "note") {
        const duration = Number(token.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0);
        const step = token.match(/<step>(\w+)<\/step>/)?.[1];
        const octave = token.match(/<octave>(\d+)<\/octave>/)?.[1];
        if (step && octave)
          starts.push({
            voice: token.match(/<voice>(\d+)<\/voice>/)?.[1] ?? "",
            onset: cursor,
            duration,
            pitch: `${step}${octave}`,
          });
        cursor += duration;
      }
    }
    const matching = starts.filter((entry) => entry.pitch === "E4");
    expect(matching).toHaveLength(2);
    expect(matching.map(({ onset }) => onset)).toEqual([0, 0]);
    expect(new Set(matching.map(({ voice }) => voice)).size).toBe(2);
    expect(matching[0]?.duration).toBe(matching[1]?.duration);
  });
  it("does not create a rest overlapping an authored note", () => {
    const timeline = createMelodyTimeline(fixture([note("a")]));
    const rests = timeline.measures
      .flatMap((measure) => measure.entries)
      .filter((entry) => entry.kind === "rest");
    expect(
      rests.every((entry) => entry.startBeats.numerator / entry.startBeats.denominator >= 1),
    ).toBe(true);
  });
  it("rejects a repeated delete without silently deleting another note", () => {
    const project = fixture();
    expect(() =>
      applyAuthoredMelodyTransaction(project, {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: project.updatedAt,
          edits: [
            { type: "delete", sourceStepId: "owner", noteId: "a" },
            { type: "delete", sourceStepId: "owner", noteId: "a" },
          ],
        },
      }),
    ).toThrow();
  });
  it("rejects repeated upserts and source-owner mismatches atomically", () => {
    const project = fixture();
    const upsert = {
      type: "upsert" as const,
      sourceStepId: "owner",
      note: { id: "a", pitch, startBeats: rational(0), durationBeats: rational(1) },
    };
    for (const edits of [[upsert, upsert], [{ ...upsert, sourceStepId: "missing" }]]) {
      expect(() =>
        applyAuthoredMelodyTransaction(project, {
          type: "melody/apply-authored-transaction",
          payload: { nowIso: project.updatedAt, edits },
        }),
      ).toThrow();
    }
  });
  it("moves equal phrase-local IDs with collision resolution and exact undo/redo", () => {
    const base = fixture([note("same")]);
    const [owner] = base.progression.steps;
    const project = {
      ...base,
      progression: {
        ...base.progression,
        steps: [
          { ...owner!, duration: musicalDuration(rational(2)) },
          { ...owner!, id: "other", duration: musicalDuration(rational(2)) },
          {
            ...owner!,
            id: "destination",
            duration: musicalDuration(rational(2)),
            authoredMelody: { notes: [] },
          },
        ],
      },
    };
    const moveToDestination = {
      type: "upsert" as const,
      sourceStepId: "owner",
      note: { id: "same", pitch, startBeats: rational(4), durationBeats: rational(1) },
    };
    expect(() =>
      applyAuthoredMelodyTransaction(project, {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: project.updatedAt,
          edits: [
            moveToDestination,
            { type: "delete", sourceStepId: "destination", noteId: "same" },
          ],
        },
      }),
    ).toThrow();
    const moved = applyAuthoredMelodyTransaction(project, {
      type: "melody/apply-authored-transaction",
      payload: {
        nowIso: project.updatedAt,
        edits: [
          {
            type: "upsert",
            sourceStepId: "owner",
            note: { id: "same", pitch, startBeats: rational(4), durationBeats: rational(1) },
          },
          {
            type: "upsert",
            sourceStepId: "other",
            note: { id: "same", pitch, startBeats: rational(5), durationBeats: rational(1) },
          },
        ],
      },
    });
    const destination = moved.project.progression.steps[2];
    expect(destination?.kind).toBe("rest");
    if (destination?.kind !== "rest") throw new Error("Expected a Rest destination");
    expect(destination.authoredMelody?.notes.map((item) => item.id)).toEqual([
      "same",
      "same~destination~1",
    ]);
    const undone = restoreAuthoredMelodyTransaction(moved.project, moved.inverse!);
    expect(undone.project.progression.steps).toEqual(project.progression.steps);
    const redone = restoreAuthoredMelodyTransaction(undone.project, undone.inverse!);
    expect(redone.project.progression.steps).toEqual(moved.project.progression.steps);
  });
});
