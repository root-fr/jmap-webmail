import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFaviconBadge } from '@/hooks/use-favicon-badge';

const fakeCtx = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  font: '',
  textAlign: '',
  textBaseline: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('useFaviconBadge', () => {
  let originalHref: string;

  beforeEach(() => {
    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.href = '/icon.svg';
    document.head.appendChild(iconLink);
    originalHref = iconLink.href;

    vi.stubGlobal('Image', FakeImage);
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => fakeCtx,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,badged');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('link').forEach((l) => l.remove());
  });

  function link() {
    return document.querySelector<HTMLLinkElement>("link[rel~='icon']")!;
  }

  it('badges by mutating the existing icon link instead of adding a second one', async () => {
    renderHook(() => useFaviconBadge(3));
    await act(async () => {});

    expect(document.querySelectorAll("link[rel~='icon']").length).toBe(1);
    expect(link().href).toBe('data:image/png;base64,badged');
  });

  it('restores the original favicon when the count returns to zero', async () => {
    const { rerender } = renderHook(({ count }) => useFaviconBadge(count), {
      initialProps: { count: 3 },
    });
    await act(async () => {});
    expect(link().href).toBe('data:image/png;base64,badged');

    rerender({ count: 0 });
    await act(async () => {});

    expect(link().href).toBe(originalHref);
  });

  it('restores the original favicon on unmount', async () => {
    const { unmount } = renderHook(() => useFaviconBadge(5));
    await act(async () => {});
    expect(link().href).toBe('data:image/png;base64,badged');

    unmount();

    expect(link().href).toBe(originalHref);
  });
});
