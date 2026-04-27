/**
 * Input sanitization for Telegram bot text inputs.
 * Prevents XSS when data is displayed on the web dashboard or in HTML-mode Telegram messages.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Strip control characters (except newline and tab), HTML-encode, and truncate. */
export function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .trim()
    .replaceAll(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars except \n \t
    .replaceAll(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch)
    .slice(0, maxLength)
}
