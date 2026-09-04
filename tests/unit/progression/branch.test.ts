import { describe, expect, it } from "vitest";
import {
  appendBranchStep,
  commitBranch,
  compareBranch,
  setBranchRejoin,
  startTemporaryBranch,
} from "../../../src/domain/progression/branch";
import type { Progression } from "../../../src/domain/progression/progression";
import type { ChordStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

function step(id: string, fn: string): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: fn, category: "core" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4), { kind: "bars", bars: 1 }),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
  };
}
function progression(): Progression {
  return { steps: [step("s1", "I"), step("s2", "vi"), step("s3", "IV"), step("s4", "V")] };
}

describe("temporary branch", () => {
  it("compares and whole-commits only the interval before the rejoin", () => {
    const p = progression();
    let branch = startTemporaryBranch(p, "b", "s2");
    branch = appendBranchStep(branch, step("b1", "ii"));
    branch = appendBranchStep(branch, step("b2", "V7/V"));
    branch = setBranchRejoin(p, branch, "s4");
    const comparison = compareBranch(p, branch);
    expect(comparison.originalInterval.map((x) => x.id)).toEqual(["s3"]);
    expect(commitBranch(p, branch).steps.map((x) => x.id)).toEqual(["s1", "s2", "b1", "b2", "s4"]);
  });

  it("supports selective commit while preserving untouched prefix/suffix", () => {
    const p = progression();
    let branch = startTemporaryBranch(p, "b", "s2");
    branch = appendBranchStep(branch, step("b1", "ii"));
    branch = appendBranchStep(branch, step("b2", "V"));
    branch = setBranchRejoin(p, branch, "s4");
    expect(commitBranch(p, branch, ["b2"]).steps.map((x) => x.id)).toEqual([
      "s1",
      "s2",
      "b2",
      "s4",
    ]);
  });

  it("rejects invalid rejoin and requires an explicit rejoin for a mid-progression commit", () => {
    const p = progression();
    const branch = appendBranchStep(startTemporaryBranch(p, "b", "s2"), step("b1", "ii"));
    expect(() => setBranchRejoin(p, branch, "s1")).toThrow();
    expect(() => commitBranch(p, branch)).toThrow(/rejoin/i);
  });

  it("can start at the end and append without a rejoin", () => {
    const p = progression();
    const branch = appendBranchStep(startTemporaryBranch(p, "b"), step("b1", "I"));
    expect(commitBranch(p, branch).steps.map((x) => x.id)).toEqual(["s1", "s2", "s3", "s4", "b1"]);
  });
});
