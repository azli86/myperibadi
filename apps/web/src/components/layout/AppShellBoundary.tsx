"use client"

import { usePathname } from "next/navigation"
import Shell from "@/components/layout/Shell"

const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password", "/reset-password"])

export default function AppShellBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const segments = pathname.split("/").filter(Boolean)
  const isAdminPortalRoute = segments[0] === "adminportal" || segments[1] === "adminportal"
  const isPublicRoute = segments[0] === "public" || pathname.startsWith("/public/")

  if (isAdminPortalRoute || isPublicRoute || AUTH_ROUTES.has(pathname)) return <>{children}</>
  return <Shell>{children}</Shell>
}
