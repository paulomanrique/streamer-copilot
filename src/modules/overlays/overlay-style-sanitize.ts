import { OVERLAY_FONTS } from '../../shared/constants.js';
import type { OverlayPreferences, OverlayVisualStyle } from '../../shared/types.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function pickHex(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return HEX_COLOR.test(raw) ? raw : undefined;
}

function pickFontKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return OVERLAY_FONTS.some((entry) => entry.key === raw) ? raw : undefined;
}

/**
 * Strict sanitizer for the visual-style fields shared between the global
 * `OverlayDefaults` blob and the per-overlay `OverlayPreferences` slot.
 *
 * Drop-on-invalid (rather than reject-with-error): a malformed value in the
 * JSON file shouldn't make the whole settings load fail — the field just
 * goes back to "inherit from defaults / CSS fallback".
 */
export function sanitizeOverlayVisualStyle(raw: unknown): OverlayVisualStyle {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: OverlayVisualStyle = {};

  const bg = pickHex(obj.backgroundColor);
  if (bg) out.backgroundColor = bg;

  if (typeof obj.backgroundOpacity === 'number') {
    out.backgroundOpacity = clamp(obj.backgroundOpacity, 0, 1);
  }

  if (typeof obj.borderRadius === 'number') {
    out.borderRadius = clamp(Math.round(obj.borderRadius), 0, 48);
  }

  const borderColor = pickHex(obj.borderColor);
  if (borderColor) out.borderColor = borderColor;

  if (typeof obj.borderWidth === 'number') {
    out.borderWidth = clamp(Math.round(obj.borderWidth), 0, 12);
  }

  const fontFamily = pickFontKey(obj.fontFamily);
  if (fontFamily) out.fontFamily = fontFamily;

  const fontColor = pickHex(obj.fontColor);
  if (fontColor) out.fontColor = fontColor;

  if (typeof obj.fontSize === 'number') {
    out.fontSize = clamp(Math.round(obj.fontSize), 8, 48);
  }

  const accent = pickHex(obj.accentColor);
  if (accent) out.accentColor = accent;

  return out;
}

/** Sanitize per-overlay overrides — same fields as `OverlayVisualStyle` plus
 *  the legacy `opacity` shortcut. */
export function sanitizeOverlayPreferences(raw: unknown): OverlayPreferences {
  const out: OverlayPreferences = sanitizeOverlayVisualStyle(raw);
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.opacity === 'number') {
      out.opacity = clamp(obj.opacity, 0, 1);
    }
  }
  return out;
}
