export type ThemeMode = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

export const THEME_STORAGE_KEY = "theme"
export const THEME_COOKIE_KEY = "theme"
export const THEME_RESOLVED_COOKIE_KEY = "theme-resolved"

export const PERSONAL_LIGHT_THEME_COLOR = "#f2f2f2"
export const PERSONAL_DARK_THEME_COLOR = "#0d0d0d"

export function getPwaThemeColor(resolvedTheme: ResolvedTheme): string {
  return resolvedTheme === "light" ? PERSONAL_LIGHT_THEME_COLOR : PERSONAL_DARK_THEME_COLOR
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system"
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "dark" || value === "light"
}
