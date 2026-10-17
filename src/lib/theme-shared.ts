// Shared by the server (reads the cookie) and the toggle (writes it).
export type Theme = "dark" | "light";
export const THEME_COOKIE = "theme";
export const THEME_COLORS: Record<Theme, string> = { dark: "#121417", light: "#F6F7F9" };
