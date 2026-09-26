import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await isAdminSession())) {
    redirect("/admin/login");
  }
  return (
    <div className="container-page">
      <AdminNav />
      {children}
    </div>
  );
}
