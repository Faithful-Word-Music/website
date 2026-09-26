/**
 * The ways a list of songs leaves the page: the device's share sheet, the
 * clipboard, or an email. Browser only - call these from event handlers.
 */

export interface SharePayload {
  title: string;
  text: string;
}

/** The browser offers a native share sheet (every phone, some computers). */
export function canShareNatively(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Go straight to the share sheet, with no menu first: on touch screens, where
 * the sheet is what people expect. A computer gets the menu, since "copy" and
 * "email" are what people reach for there.
 */
export function prefersShareSheet(): boolean {
  return canShareNatively() && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Opens the share sheet. True if it was shown - including when the visitor
 * then closed it, which is a choice, not a failure. False if it could not
 * open at all, so the caller can offer the menu instead.
 */
export async function shareNatively(payload: SharePayload): Promise<boolean> {
  try {
    await navigator.share(payload);
    return true;
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
}

/** Copies the text. Falls back to the old selection trick where the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

/** A mailto: link with subject and body filled in, recipients left to the visitor. */
export function emailHref({ title, text }: SharePayload): string {
  // Mail clients expect CRLF line breaks in a mailto body.
  const body = text.replace(/\r?\n/g, "\r\n");
  return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
