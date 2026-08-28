import { describe, expect, it } from "vitest";

import { takeSuggestionSubmission } from "../server/suggestion-rate-limit";

function requestFor(ip: string) {
  return { ip, socket: { remoteAddress: ip } } as never;
}

describe("suggestion submission rate limit", () => {
  it("allows three submissions then rejects the fourth within the same window", () => {
    const request = requestFor("198.51.100.77");
    expect(takeSuggestionSubmission(request)).toBe(true);
    expect(takeSuggestionSubmission(request)).toBe(true);
    expect(takeSuggestionSubmission(request)).toBe(true);
    expect(takeSuggestionSubmission(request)).toBe(false);
  });

  it("keeps separate clients isolated", () => {
    expect(takeSuggestionSubmission(requestFor("198.51.100.78"))).toBe(true);
    expect(takeSuggestionSubmission(requestFor("198.51.100.79"))).toBe(true);
  });
});
