import { describe, expect, it } from "vitest";

import { selectVisibleBadges } from "./badge-visibility";

describe("selectVisibleBadges", () => {
  it("returns only earned when all badges are earned", () => {
    const badges = [
      { id: "a", earned: true, progress: 1, threshold: 1 },
      { id: "b", earned: true, progress: 5, threshold: 5 },
    ];
    expect(selectVisibleBadges(badges)).toEqual(badges);
  });

  it("includes earned plus single closest unearned by progress ratio", () => {
    const badges = [
      { id: "e", earned: true, progress: 1, threshold: 1 },
      { id: "u1", earned: false, progress: 3, threshold: 10 },
      { id: "u2", earned: false, progress: 8, threshold: 10 },
    ];
    const out = selectVisibleBadges(badges);
    expect(out.map((b) => b.id)).toEqual(["e", "u2"]);
  });

  it("when none earned, shows only the closest unearned", () => {
    const badges = [
      { id: "a", earned: false, progress: 1, threshold: 100 },
      { id: "b", earned: false, progress: 50, threshold: 100 },
    ];
    const out = selectVisibleBadges(badges);
    expect(out).toEqual([badges[1]]);
  });
});
