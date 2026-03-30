import { describe, expect, it } from "vitest";

import { parseBackendDateTime } from "./utils";

describe("parseBackendDateTime", () => {
  it("parses naive backend datetime as UTC", () => {
    const d = parseBackendDateTime("2026-03-15T14:30:00");
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it("parses ISO strings with Z without double-appending", () => {
    const d = parseBackendDateTime("2026-03-15T14:30:00Z");
    expect(d.toISOString()).toContain("2026-03-15");
  });
});
