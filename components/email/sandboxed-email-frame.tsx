"use client";

import { useRef, useEffect, useCallback } from "react";
import { generateIframeStylesheet } from "@/lib/color-transform";

interface SandboxedEmailFrameProps {
  html: string;
  className?: string;
  theme?: 'light' | 'dark';
}

function wrapHtmlForIframe(sanitizedHtml: string, theme: 'light' | 'dark'): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${generateIframeStylesheet(theme)}
</head>
<body>${sanitizedHtml}</body>
</html>`;
}

export function SandboxedEmailFrame({ html, className, theme = 'light' }: SandboxedEmailFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const height = iframe.contentDocument.body.scrollHeight;
    iframe.style.height = `${height + 16}px`;
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;

    const handleLoad = () => {
      updateHeight();

      const doc = iframe.contentDocument;
      if (!doc?.body) return;

      observer = new ResizeObserver(updateHeight);
      observer.observe(doc.body);

      doc.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor?.href) {
          e.preventDefault();
          window.open(anchor.href, '_blank', 'noopener,noreferrer');
        }
      });
    };

    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      observer?.disconnect();
    };
  }, [html, theme, updateHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      srcDoc={wrapHtmlForIframe(html, theme)}
      className={className}
      style={{
        width: '100%',
        border: 'none',
        overflow: 'hidden',
        minHeight: '100px',
      }}
      title="Email content"
    />
  );
}
