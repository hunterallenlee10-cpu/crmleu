import "server-only";
import { cookies } from "next/headers";
import { THEME_COOKIE, type Theme } from "@/lib/theme-shared";

// The theme the person picked with the toggle. Dark unless they chose light.
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "light" ? "light" : "dark";
}
