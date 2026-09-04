import { describe, expect, it } from "vitest";
import {
  addRational,
  compareRational,
  equalRational,
  rational,
  subtractRational,
} from "../../../src/domain/timing/rational";

describe("Rational", () => {
  it("normalizes fractions", () =>
    expect(rational(6, -8)).toEqual({ numerator: -3, denominator: 4 }));
  it("adds exactly", () =>
    expect(addRational(rational(1, 3), rational(1, 6))).toEqual(rational(1, 2)));
  it("subtracts exactly", () =>
    expect(subtractRational(rational(3, 4), rational(1, 2))).toEqual(rational(1, 4)));
  it("compares semantic equality", () => {
    expect(equalRational(rational(2, 4), rational(1, 2))).toBe(true);
    expect(compareRational(rational(1, 8), rational(1, 4))).toBe(-1);
  });
});
