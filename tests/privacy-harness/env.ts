/** Single source of truth — must match playwright.config.ts baseURL default. */
export const PIXPASS_BASE_URL = process.env.PIXPASS_BASE_URL ?? 'https://pixpass.app'

export function pixpassSelfHosts(): Set<string> {
  const baseHost = new URL(PIXPASS_BASE_URL).hostname
  return new Set([baseHost, 'localhost', '127.0.0.1', 'pixpass.app', 'www.pixpass.app'])
}
