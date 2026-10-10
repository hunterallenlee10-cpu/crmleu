import Link from "next/link";
import { BrandName } from "@/components/brand";
import { DesktopNav, MobileNav } from "@/components/nav";
import { getProfile } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfile();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/today" className="text-lg">
            <BrandName />
          </Link>
          <DesktopNav role={profile.role} />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{profile.full_name}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-gold">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-28 md:pb-12">{children}</main>
      <MobileNav role={profile.role} />
    </>
  );
}
