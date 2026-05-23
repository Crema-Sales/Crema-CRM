import { describe, expect, it } from "vitest";

import { getDeepLink } from "./use-help";

describe("getDeepLink", () => {
  it("builds a URL with only the help topic when no anchor is supplied", () => {
    expect(getDeepLink("/funnel", "funnel")).toBe("/funnel?help=funnel");
  });

  it("includes the anchor when supplied", () => {
    expect(getDeepLink("/funnel", "funnel", "funnel-stages")).toBe(
      "/funnel?help=funnel&anchor=funnel-stages",
    );
  });

  it("preserves nested pathnames", () => {
    expect(getDeepLink("/companies/abc-123", "company-detail", "company-activity")).toBe(
      "/companies/abc-123?help=company-detail&anchor=company-activity",
    );
  });

  it("URL-encodes anchor values that contain reserved characters", () => {
    expect(getDeepLink("/today", "today", "section with spaces")).toBe(
      "/today?help=today&anchor=section+with+spaces",
    );
  });

  it("treats an empty anchor as missing", () => {
    expect(getDeepLink("/today", "today", "")).toBe("/today?help=today");
  });
});
