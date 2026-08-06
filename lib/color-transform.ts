type RGB = { r: number; g: number; b: number; a?: number };

const namedColors: Record<string, string> = {
  transparent: 'rgba(0,0,0,0)',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  purple: '#800080',
};

export function parseColor(colorString: string): RGB | null {
  if (!colorString || typeof colorString !== 'string') {
    return null;
  }

  const color = colorString.trim().toLowerCase();

  if (color === 'inherit' || color === 'currentcolor') {
    return null;
  }

  if (namedColors[color]) {
    return parseColor(namedColors[color]);
  }

  if (color === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
    };
  }

  const rgbMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : undefined;

    if (r > 255 || g > 255 || b > 255 || r < 0 || g < 0 || b < 0) {
      return null;
    }
    if (a !== undefined && (a < 0 || a > 1)) {
      return null;
    }

    return { r, g, b, a };
  }

  const hslMatch = color.match(/^hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)$/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const a = hslMatch[4] ? parseFloat(hslMatch[4]) : undefined;

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
      a,
    };
  }

  return null;
}

export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function isDarkColor(colorString: string): boolean {
  const rgb = parseColor(colorString);
  if (!rgb) return false;
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance < 0.5;
}

export function transformColorForDarkMode(colorString: string): string {
  const rgb = parseColor(colorString);
  if (!rgb) return colorString;

  if (rgb.a !== undefined && rgb.a < 0.1) {
    return colorString;
  }

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  if (luminance >= 0.6) return colorString;

  const blendFactor = 0.85 - (luminance / 0.6) * 0.55;

  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * blendFactor));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * blendFactor));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * blendFactor));

  return rgb.a !== undefined ? `rgba(${r}, ${g}, ${b}, ${rgb.a})` : `rgb(${r}, ${g}, ${b})`;
}

export function transformBgColorForDarkMode(colorString: string): string {
  const rgb = parseColor(colorString);
  if (!rgb) return colorString;

  if (rgb.a !== undefined && rgb.a < 0.1) {
    return colorString;
  }

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  if (luminance < 0.2) return colorString;

  const blendFactor = Math.min(0.9, (luminance - 0.2) * 1.125);
  const darkR = 35, darkG = 35, darkB = 35;

  const r = Math.max(0, Math.round(rgb.r + (darkR - rgb.r) * blendFactor));
  const g = Math.max(0, Math.round(rgb.g + (darkG - rgb.g) * blendFactor));
  const b = Math.max(0, Math.round(rgb.b + (darkB - rgb.b) * blendFactor));

  return rgb.a !== undefined ? `rgba(${r}, ${g}, ${b}, ${rgb.a})` : `rgb(${r}, ${g}, ${b})`;
}

export function transformColorForLightMode(colorString: string): string {
  const rgb = parseColor(colorString);
  if (!rgb) return colorString;

  if (rgb.a !== undefined && rgb.a < 0.1) {
    return colorString;
  }

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  // Already dark enough to read against a white/light background.
  if (luminance <= 0.4) return colorString;

  const blendFactor = 0.85 - ((1 - luminance) / 0.6) * 0.55;

  // Blend toward the app's own default light-mode body text color (#1e293b),
  // matching how transformColorForDarkMode blends toward white rather than pure black.
  const targetR = 30, targetG = 41, targetB = 59;

  const r = Math.max(0, Math.round(rgb.r + (targetR - rgb.r) * blendFactor));
  const g = Math.max(0, Math.round(rgb.g + (targetG - rgb.g) * blendFactor));
  const b = Math.max(0, Math.round(rgb.b + (targetB - rgb.b) * blendFactor));

  return rgb.a !== undefined ? `rgba(${r}, ${g}, ${b}, ${rgb.a})` : `rgb(${r}, ${g}, ${b})`;
}

export function transformBgColorForLightMode(colorString: string): string {
  const rgb = parseColor(colorString);
  if (!rgb) return colorString;

  if (rgb.a !== undefined && rgb.a < 0.1) {
    return colorString;
  }

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  // Already light enough to read text against, no correction needed.
  if (luminance > 0.8) return colorString;

  const blendFactor = Math.min(0.9, (0.8 - luminance) * 1.125);
  const lightR = 255, lightG = 255, lightB = 255;

  const r = Math.min(255, Math.round(rgb.r + (lightR - rgb.r) * blendFactor));
  const g = Math.min(255, Math.round(rgb.g + (lightG - rgb.g) * blendFactor));
  const b = Math.min(255, Math.round(rgb.b + (lightB - rgb.b) * blendFactor));

  return rgb.a !== undefined ? `rgba(${r}, ${g}, ${b}, ${rgb.a})` : `rgb(${r}, ${g}, ${b})`;
}

export function transformInlineStyles(cssText: string, theme: 'light' | 'dark'): string {
  if (!cssText) {
    return cssText;
  }

  const transformColor = theme === 'dark' ? transformColorForDarkMode : transformColorForLightMode;
  const transformBgColor = theme === 'dark' ? transformBgColorForDarkMode : transformBgColorForLightMode;

  const styleProps = cssText.split(';').map((prop) => prop.trim()).filter(Boolean);

  const transformedProps = styleProps.map((prop) => {
    const colonIndex = prop.indexOf(':');
    if (colonIndex === -1) return prop;

    const property = prop.slice(0, colonIndex).trim();
    const value = prop.slice(colonIndex + 1).trim();

    if (property === 'color') {
      const hasImportant = value.includes('!important');
      const colorValue = value.replace('!important', '').trim();
      const transformed = transformColor(colorValue);
      return `${property}: ${transformed}${hasImportant ? ' !important' : ''}`;
    }

    if (property === 'background-color') {
      const hasImportant = value.includes('!important');
      const colorValue = value.replace('!important', '').trim();
      const transformed = transformBgColor(colorValue);
      return `${property}: ${transformed}${hasImportant ? ' !important' : ''}`;
    }

    if (property === 'background' && !value.includes('url(')) {
      const colorMatch = value.match(/#[0-9a-f]{3,6}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+/i);
      if (colorMatch) {
        const hasImportant = value.includes('!important');
        const originalColor = colorMatch[0];
        const transformed = transformBgColor(originalColor);
        const newValue = value.replace(originalColor, transformed);
        return `${property}: ${newValue.replace('!important', '').trim()}${hasImportant ? ' !important' : ''}`;
      }
    }

    if (property === 'border-color') {
      const hasImportant = value.includes('!important');
      const colorValue = value.replace('!important', '').trim();
      const transformed = transformColor(colorValue);
      return `${property}: ${transformed}${hasImportant ? ' !important' : ''}`;
    }

    return prop;
  });

  return transformedProps.join('; ');
}

/**
 * Generate a style block for iframe-rendered emails.
 * Takes the app's own resolved theme explicitly rather than relying on
 * prefers-color-scheme, which reflects the OS/browser preference and can
 * disagree with an explicit in-app light/dark override.
 */
export function generateIframeStylesheet(theme: 'light' | 'dark' = 'light'): string {
  const textColor = theme === 'dark' ? '#e2e8f0' : '#1e293b';
  const bgColor = theme === 'dark' ? '#232323' : '#ffffff';
  const linkColor = theme === 'dark' ? '#60a5fa' : '#3b82f6';
  const imgOpacity = theme === 'dark' ? '0.9' : '1';

  return `
    <style>
      :root {
        /* Tell the browser this content already adapts itself, so any
           browser-level "force dark mode on websites" heuristic doesn't
           additionally reprocess it and produce double-inverted colors. */
        color-scheme: ${theme};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow-x: auto;
        color: ${textColor};
        background: ${bgColor};
      }
      img { max-width: 100%; height: auto; opacity: ${imgOpacity}; }
      table { max-width: 100%; }
      a { color: ${linkColor}; }
      pre, code { white-space: pre-wrap; word-wrap: break-word; }
    </style>
  `;
}
