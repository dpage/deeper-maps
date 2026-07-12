// How long to keep the object URL alive after triggering the download. Revoking
// synchronously right after click() can abort the download of a large blob
// before the browser has read it, so we defer the revoke instead.
const REVOKE_DELAY_MS = 60_000;

/**
 * Prompt the browser to download a Blob under a given filename. Wraps the
 * standard object-URL + synthetic-anchor dance, then revokes the URL on a
 * timer so the blob is eventually freed without cutting the download short.
 * If constructing/clicking the anchor throws, the URL is revoked immediately.
 */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
