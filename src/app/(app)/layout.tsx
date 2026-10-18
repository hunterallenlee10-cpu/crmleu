import Link from "next/link";
import { BrandName } from "@/components/brand";
import { DesktopNav, MobileNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProfile } from "@/lib/auth";
import { getTheme } from "@/lib/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [profile, theme] = await Promise.all([getProfile(), getTheme()]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-surface-2">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/today" className="rounded-control text-base">
            <BrandName />
          </Link>
          <DesktopNav role={profile.role} />
          <div className="flex items-center gap-1">
            <span className="mr-1 hidden text-sm text-muted lg:inline">{profile.full_name}</span>
            <ThemeToggle initial={theme} />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-control px-3 text-sm text-muted transition-colors duration-150 hover:bg-fg/[0.06] hover:text-fg sm:min-h-9"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-28 md:pt-10 md:pb-16">{children}</main>
      <MobileNav role={profile.role} />
    </>
  );
}
