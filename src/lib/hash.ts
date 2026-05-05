export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ScanContentInput {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * Order-insensitive content hash for a set of files. Equivalent across
 * folder/zip/individual-file uploads of the same payload. See spec §7.4.
 */
export async function scanContentHash(files: ScanContentInput[]): Promise<string> {
  const sorted = [...files].sort((a, b) =>
    a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0,
  );
  const lines: string[] = [];
  for (const f of sorted) {
    lines.push(`${f.fileName}:${await sha256Hex(f.bytes)}\n`);
  }
  return sha256Hex(new TextEncoder().encode(lines.join('')));
}
