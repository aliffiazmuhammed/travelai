/**
 * Brand tokens mirrored from the web design system (frontend/src/index.css).
 * The web values are HSL; these are their resolved hex equivalents so both
 * clients render one identity. Keep this file free of component decisions.
 */

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  primaryGlow: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  ring: string;
  skeletonBase: string;
  skeletonHighlight: string;
  shadow: string;
}

const light: Palette = {
  background: '#f7f3ea',
  foreground: '#1d2925',
  card: '#ffffff',
  cardForeground: '#1d2925',
  primary: '#173f35',
  primaryForeground: '#ffffff',
  primaryGlow: '#9dbcb4',
  secondary: '#9dbcb4',
  secondaryForeground: '#173f35',
  muted: '#e4eae7',
  mutedForeground: '#52665f',
  accent: '#e87656',
  accentForeground: '#173f35',
  destructive: '#ca2b2b',
  destructiveForeground: '#ffffff',
  border: '#d9e1dc',
  ring: '#173f35',
  skeletonBase: '#ebe6db',
  skeletonHighlight: '#faf7f0',
  shadow: '#24423b',
};

const dark: Palette = {
  background: '#102d26',
  foreground: '#f7f3ea',
  card: '#1b372f',
  cardForeground: '#f7f3ea',
  primary: '#f7f3ea',
  primaryForeground: '#173f35',
  primaryGlow: '#9dbcb4',
  secondary: '#2a463f',
  secondaryForeground: '#f7f3ea',
  muted: '#273f39',
  mutedForeground: '#aac5be',
  accent: '#e87656',
  accentForeground: '#102d26',
  destructive: '#e46767',
  destructiveForeground: '#102d26',
  border: '#345148',
  ring: '#f7f3ea',
  skeletonBase: '#273f39',
  skeletonHighlight: '#36544c',
  shadow: '#000000',
};

export const palettes = { light, dark } as const;

/** Registered names from @expo-google-fonts/cabin in the root layout. */
export const fontFamily = {
  regular: 'Cabin_400Regular',
  medium: 'Cabin_500Medium',
  semibold: 'Cabin_600SemiBold',
  bold: 'Cabin_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fontFamily.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20, letterSpacing: 0.2 },
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 24,
  pill: 999,
} as const;

/** Web shadow tokens (soft/card/hover) expressed as React Native shadows. */
export const shadows = {
  soft: {
    shadowColor: light.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
    elevation: 2,
  },
  card: {
    shadowColor: light.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 4,
  },
  hover: {
    shadowColor: light.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 40,
    elevation: 8,
  },
} as const;

export const duration = {
  fast: 150,
  base: 250,
  slow: 400,
} as const;
