/**
 * yump3 design tokens.
 *
 * One source of truth for color, spacing, radius and type. New UI must use
 * these tokens instead of ad-hoc hex values.
 */

export const palette = {
  /** App background */
  bg: '#0C0E12',
  /** Cards, sheets, list rows */
  surface: '#161920',
  /** Slightly raised surfaces (chips, inputs, panels) */
  surfaceAlt: '#1B1F28',
  /** Hairline borders */
  border: '#20242E',
  /** Emphasised borders (inputs, badges, toggles off) */
  borderStrong: '#2D3342',
  /** Disabled icons/labels */
  disabled: '#3E4554',

  text: '#FFFFFF',
  /** Secondary text — AA contrast on bg */
  textMuted: '#9AA3B2',
  /** Tertiary text/labels — AA contrast on bg, use small sizes sparingly */
  textDim: '#7C8598',

  accent: '#00E676',
  /** Text/icon color on top of the accent */
  accentInk: '#06210F',
  /** Subtle accent wash for selected rows */
  accentWash: 'rgba(0, 230, 118, 0.10)',

  danger: '#FF3B30',
  dangerSoft: '#FF9E96',
  /** Favorites heart — intentionally different from the destructive red */
  like: '#FF4D6D',

  overlay: 'rgba(0, 0, 0, 0.75)',
};

/** 4pt spacing scale */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** Minimum touch target helper for small icon buttons (44dp guideline). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

/** Type scale (min size 12 for legibility) */
export const type = {
  caption: 12,
  small: 13,
  body: 14,
  title: 16,
  h3: 20,
  h2: 26,
};
