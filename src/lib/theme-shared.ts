// Shared by the server (reads the cookie) and the toggle (writes it).
export type Theme = "dark" | "light";
export const THEME_COOKIE = "theme";
export const THEME_COLORS: Record<Theme, string> = { dark: "#0b0b0b", light: "#f4f4f2" };
