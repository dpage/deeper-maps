import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerDownload } from '../download';

describe('triggerDownload', () => {
  const createObjectURL = vi.fn(() => 'blob:mock');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    // jsdom implements neither URL.createObjectURL nor revokeObjectURL.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an anchor with the download filename, clicks it, and revokes the URL', () => {
    let captured: HTMLAnchorElement | null = null;
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(<T extends Node>(node: T): T => {
        captured = node as unknown as HTMLAnchorElement;
        return node;
      });
    const blob = new Blob(['data'], { type: 'application/zip' });

    triggerDownload(blob, 'scan.zip');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(captured).not.toBeNull();
    expect(captured!.download).toBe('scan.zip');
    expect(captured!.href).toContain('blob:mock');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    appendSpy.mockRestore();
  });

  it('revokes the object URL even if click throws', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    const blob = new Blob(['data']);
    expect(() => triggerDownload(blob, 'x.zip')).toThrow('blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    clickSpy.mockRestore();
  });
});
