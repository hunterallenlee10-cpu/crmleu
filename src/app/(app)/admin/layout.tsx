import { requireAdmin } from "@/lib/auth";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="space-y-8">
      <AdminTabs />
      {children}
    </div>
  );
}
