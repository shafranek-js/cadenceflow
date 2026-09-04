export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

export function rational(numerator: number, denominator = 1): Rational {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator === 0) throw new RangeError("denominator must not be zero");
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return Object.freeze({
    numerator: (numerator / divisor) * sign,
    denominator: Math.abs(denominator / divisor),
  });
}

export const ZERO: Rational = rational(0);
export const ONE: Rational = rational(1);

export function addRational(a: Rational, b: Rational): Rational {
  return rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

export function subtractRational(a: Rational, b: Rational): Rational {
  return rational(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

export function multiplyRational(a: Rational, b: Rational): Rational {
  return rational(a.numerator * b.numerator, a.denominator * b.denominator);
}

export function divideRational(a: Rational, b: Rational): Rational {
  if (b.numerator === 0) throw new RangeError("cannot divide by zero");
  return rational(a.numerator * b.denominator, a.denominator * b.numerator);
}

export function compareRational(a: Rational, b: Rational): -1 | 0 | 1 {
  const delta = a.numerator * b.denominator - b.numerator * a.denominator;
  return delta < 0 ? -1 : delta > 0 ? 1 : 0;
}

export function equalRational(a: Rational, b: Rational): boolean {
  return compareRational(a, b) === 0;
}

export function rationalToNumber(value: Rational): number {
  return value.numerator / value.denominator;
}
