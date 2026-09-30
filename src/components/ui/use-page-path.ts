"use client";

import { usePathname } from "next/navigation";

import { normalizePath } from "@/lib/page-path";

/** usePathname(), with the regenerated home page's "/index" read as "/" (see normalizePath). */
export function usePagePath(): string {
  return normalizePath(usePathname());
}
