import type { Request } from "express";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 3;
const attempts = new Map<string, { count: number; resetAt: number }>();

function requestKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "anonymous";
}

/**
 * Lightweight abuse protection for anonymous suggestions. For multi-instance
 * production deployments, replace this in-memory store with Redis or a gateway limit.
 */
export function takeSuggestionSubmission(req: Request) {
  const now = Date.now();
  const key = requestKey(req);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_SUBMISSIONS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}
