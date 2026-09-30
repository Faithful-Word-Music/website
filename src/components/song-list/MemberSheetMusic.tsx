"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { PdfPreview } from "@/components/song-list/PdfPreview";
import { SheetFileButton } from "@/components/song-list/SheetFileButton";
import { songListContent } from "@/content/song-list";
import type { PublicSheetFile } from "@/lib/sheet-music";

const { sheetMusic: copy } = songListContent.songPage;

/**
 * Copyrighted sheet music, for signed-in members.
 *
 * Song pages are cached and the same for everyone, so they cannot know who
 * is looking. These pieces find out in the browser - is someone signed in,
 * and does their account include "View member sheet music"? - and unlock the
 * members' files if so. That is only about what to show: the file route
 * checks the session again before serving anything (see
 * src/app/library/songs/[song]/sheet-music/[file]/route.ts).
 */

type Access =
  /** Accounts are switched off, or the page has no members' files. */
  | "unavailable"
  | "checking"
  | "signed-out"
  /** Signed in, but their roles do not include sheet music. */
  | "denied"
  | "allowed";

const AccessContext = createContext<Access>("unavailable");

/** Wraps a song's sheet music when it has members-only files and accounts are on. */
export function SheetMusicAccessProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [result, setResult] = useState<{ userId: string; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ canViewSheetMusic?: boolean }>) : {}))
      .then((data: { canViewSheetMusic?: boolean }) => {
        if (!cancelled) setResult({ userId, allowed: Boolean(data.canViewSheetMusic) });
      })
      .catch(() => {
        if (!cancelled) setResult({ userId, allowed: false });
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  let access: Access;
  if (!isLoaded) access = "checking";
  else if (!isSignedIn) access = "signed-out";
  else if (!result || result.userId !== userId) access = "checking";
  else access = result.allowed ? "allowed" : "denied";

  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

function LoginLink() {
  const pathname = usePathname();
  return (
    <Link
      href={`/login?redirect_url=${encodeURIComponent(pathname)}`}
      className="text-ink underline decoration-gold underline-offset-4 transition-colors hover:text-gold-dark"
    >
      {copy.logIn}
    </Link>
  );
}

/** The note above the list: what a visitor needs to do to see the members' files. */
export function MembersNote({ hasPublicFiles }: { hasPublicFiles: boolean }) {
  const access = useContext(AccessContext);
  if (access === "allowed" || access === "checking") return null;
  if (access === "signed-out") {
    return (
      <p className="mt-2 text-muted">
        {copy.membersNoteSignedOut} <LoginLink /> {copy.membersNoteLogIn}
      </p>
    );
  }
  if (access === "denied") return <p className="mt-2 text-muted">{copy.membersNoteDenied}</p>;
  return hasPublicFiles ? null : <p className="mt-2 text-muted">{copy.restricted}</p>;
}

/** One row's members-only files: buttons for members, a "Members only · Log in" note for everyone else. */
export function MembersOnlyFiles({ files }: { files: PublicSheetFile[] }) {
  const access = useContext(AccessContext);

  if (access === "allowed") {
    return (
      <>
        {files.map((file) => (
          <SheetFileButton key={file.membersHref} format={file.format} href={file.membersHref!} />
        ))}
      </>
    );
  }

  const formats = [...new Set(files.map((file) => copy.formats[file.format]))].join(" · ");
  return (
    <span className="text-sm text-muted">
      {formats}
      {access === "signed-out" || access === "denied" ? (
        <>
          {" · "}
          {copy.membersOnly}
          {access === "signed-out" ? (
            <>
              {" · "}
              <LoginLink />
            </>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

/** The in-page preview of a members' PDF, shown only once the visitor is known to be allowed. */
export function MemberPreview({ src, title, label }: { src: string; title: string; label: string }) {
  const access = useContext(AccessContext);
  if (access !== "allowed") return null;
  return <PdfPreview src={src} title={title} label={label} />;
}
