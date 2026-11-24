import type { ReactNode } from "react";

import { FavoritesProvider } from "@/components/library/FavoritesProvider";

/**
 * Shared by every Library page. It must stay free of session reads: /library
 * and the song pages are cached and the same for everyone, and whatever is
 * personal is fetched by the browser afterwards.
 */
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}
