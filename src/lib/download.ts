/**
 * Prompt the browser to download a Blob under a given filename. Wraps the
 * standard object-URL + synthetic-anchor dance and always revokes the URL so
 * the blob can be garbage-collected once the download has started.
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
  } finally {
    URL.revokeObjectURL(url);
  }
}
