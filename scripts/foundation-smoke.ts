import { rational, addRational } from "../src/domain/timing/rational";
import { realizeProgressionsChord } from "../src/domain/harmony/modules/progressions";
import { recommend } from "../src/domain/recommendations/engine";
import { manhattanRoute } from "../src/domain/harmony/topology";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
const half = addRational(rational(1, 3), rational(1, 6));
check(half.numerator === 1 && half.denominator === 2, "rational arithmetic");
check(realizeProgressionsChord("V7/V", 0).spelling.symbol === "D", "V7/V in C should root on D");
const result = recommend({
  currentFunctionId: "ii",
  recentFunctionIds: ["vi", "ii"],
  visibleFunctionIds: ["I", "ii", "IV", "V", "vi"],
});
check(result.bestMatch?.functionId === "V", "ii should recommend V");
const route = manhattanRoute({ column: 0, row: 0 }, { column: 2, row: 2 });
check(
  route.every(
    (p, i) => i === 0 || p.column === route[i - 1]!.column || p.row === route[i - 1]!.row,
  ),
  "route must be orthogonal",
);
console.log("CadenceFlow foundation smoke: PASS");
