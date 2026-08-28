"use client";

import { useEffect, useRef } from "react";

const SIZE = 32;

export function useFaviconBadge(count: number) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const baseLinkRef = useRef<HTMLLinkElement | null>(null);
  const originalHrefRef = useRef<string>("");
  const imageLoaded = useRef(false);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    // We mutate href on the existing Next.js-rendered <link> directly.
    // Firefox only updates the tab favicon when the href of the element it
    // already tracks changes — it ignores new <link> nodes added dynamically.
    // Changing href is safe: the React reconciler crash ("parentNode is null")
    // only happens when a tracked node is *removed* from the DOM, not when
    // its attributes change. On cleanup we restore the original href.
    const baseLink = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!baseLink?.href) return;

    baseLinkRef.current = baseLink;
    originalHrefRef.current = baseLink.href;

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvasRef.current = canvas;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageLoaded.current = true;
      imageRef.current = img;
      if (countRef.current > 0) {
        drawBadge(canvas, img, countRef.current, baseLink);
      }
    };
    img.onerror = () => {
      imageLoaded.current = true;
    };
    img.src = originalHrefRef.current;

    return () => {
      if (baseLinkRef.current) {
        baseLinkRef.current.href = originalHrefRef.current;
      }
    };
  }, []);

  useEffect(() => {
    const baseLink = baseLinkRef.current;
    if (!baseLink || !imageLoaded.current) return;

    if (count <= 0) {
      baseLink.href = originalHrefRef.current;
      return;
    }

    if (canvasRef.current) {
      drawBadge(canvasRef.current, imageRef.current, count, baseLink);
    }
  }, [count]);
}

function drawBadge(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  count: number,
  link: HTMLLinkElement,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, SIZE, SIZE);
  if (image) ctx.drawImage(image, 0, 0, SIZE, SIZE);

  const label = count > 9 ? "+" : String(count);
  const fontSize = SIZE * 0.55;
  const padding = 2;
  ctx.font = `bold ${fontSize}px arial,sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const textWidth = ctx.measureText(label).width;
  const badgeW = textWidth + padding * 2;
  const badgeH = fontSize + padding;
  const x = SIZE - badgeW - 1;
  const y = SIZE - badgeH;

  ctx.fillStyle = "#ef4444";
  ctx.strokeStyle = "#b91c1c";
  ctx.lineWidth = 1;
  // roundRect is Baseline 2023; fall back to fillRect on Safari 15 and below.
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, badgeW, badgeH, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, badgeW, badgeH);
    ctx.strokeRect(x, y, badgeW, badgeH);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, x + padding, y + padding / 2);

  link.href = canvas.toDataURL("image/png");
}
