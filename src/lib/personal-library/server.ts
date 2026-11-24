import "server-only";

import { randomUUID } from "node:crypto";

import { deleteAccount, getAccount, type ClerkResult } from "@/lib/auth/clerk";
import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { currentClerkConfig } from "@/lib/auth/clerk-env";
import { db, deleteUserData, type Sql } from "@/lib/auth/store";
import { applySchema } from "@/lib/db";
import type { FavoriteSongInfo } from "@/lib/favorites-api";
import { deleteNotificationData } from "@/lib/notifications/store";
import { listCatalogSongs, plannerConfigured } from "@/lib/service-planner/store";
import { getSheetMusicIndex } from "@/lib/sheet-music-index";
import { indexEntries, songUrlSlug } from "@/lib/song-identity";
import { songPath } from "@/lib/song-list";

import { eraseAccount, recoverPendingErasures, type ClerkDeletion, type ErasureCleanup, type ErasureOutcome, type RecoverySummary } from "./erasure";
import { buildPersonalDirectory, type PersonalDirectory } from "./identity";
import { PERSONAL_LIBRARY_SCHEMA, PERSONAL_LIBRARY_SCHEMA_READY } from "./schema.mjs";
import {
  beginErasure,
  completeErasure,
  deletePersonalLibraryData,
  listPendingErasures,
  noteErasureRecovery,
  releaseErasureAttempt,
  type LibraryOwner,
  type PersonalLibrarySql,
} from "./store";

/** The most accounts one recovery run looks at. */
const RECOVERY_LIMIT = 25;

let installed = false;

function adapt(sql: Sql): PersonalLibrarySql {
  return {
    query: async (text, params) => (await sql.query(text, params)) as Array<Record<string, unknown>>,
    transaction: async (statements) =>
      (await sql.transaction((txn) => statements.map(({ text, params }) => txn.query(text, params)))) as Array<
        Array<Record<string, unknown>>
      >,
  };
}

/** The store's client, with its tables installed on first use. */
export async function personalLibraryClient(env: ClerkEnv): Promise<PersonalLibrarySql> {
  const sql = await db(env);
  if (!installed) {
    await applySchema(sql, PERSONAL_LIBRARY_SCHEMA, PERSONAL_LIBRARY_SCHEMA_READY);
    installed = true;
  }
  return adapt(sql);
}

/**
 * For account deletion: the client, or null when the tables truly do not exist
 * (an install that failed), in which case there is nothing of theirs to erase.
 * Throws when that cannot be determined, so deletion stops before Clerk.
 */
async function erasureClient(env: ClerkEnv): Promise<PersonalLibrarySql | null> {
  try {
    return await personalLibraryClient(env);
  } catch (error) {
    console.error("[personal-library] Could not install the tables:", error instanceof Error ? error.message : "unknown error");
    const sql = await db(env);
    const [row] = (await sql.query(`SELECT to_regclass('public.personal_library_erasures') IS NOT NULL AS present`)) as Array<{
      present: boolean;
    }>;
    return row.present ? adapt(sql) : null;
  }
}

export interface PersonalSongs {
  directory: PersonalDirectory;
  /** Public details by canonical ID, copied field by field so nothing else can reach a response. */
  songs: ReadonlyMap<string, FavoriteSongInfo>;
}

function songInfo(song: { songId: string; title: string; number: string | null; collection: string | null }): FavoriteSongInfo {
  const { songId, title, number, collection } = song;
  return { songId, title, number, collection, href: songPath(songUrlSlug({ songId, title, number, collection })) };
}

/**
 * Current songs for validating a new record. Unlike songDirectory(), a source
 * that cannot be read is reported, never treated as "this song does not exist".
 * Reads the catalog directly, so a late legacy row is found at once even while
 * the public pages' cached catalog has not refreshed.
 */
export async function personalSongs(env: ClerkEnv): Promise<PersonalSongs> {
  const unavailable: PersonalSongs = { directory: { status: "unavailable" }, songs: new Map() };
  if (!plannerConfigured()) return unavailable;
  try {
    const index = await getSheetMusicIndex();
    if (!index.ok) return unavailable;
    const catalog = await listCatalogSongs(env, indexEntries(index.index.songs));
    const songs = new Map<string, FavoriteSongInfo>();
    for (const song of index.index.songs) {
      songs.set(song.id, songInfo({ songId: song.id, title: song.title, number: song.hymnNumber, collection: song.collection }));
    }
    const directory = buildPersonalDirectory(index.index.songs.map((song) => song.id), catalog);
    // A catalog row can join an index song that differs only by case; its details stay the index's.
    if (directory.status === "ok") {
      const present = new Set(directory.entries.map((entry) => entry.id));
      for (const song of catalog) if (present.has(song.songId) && !songs.has(song.songId)) songs.set(song.songId, songInfo(song));
    }
    return { directory, songs };
  } catch (error) {
    console.error("[personal-library] Could not read the song directory:", error instanceof Error ? error.message : "unknown error");
    return unavailable;
  }
}

export async function personalSongDirectory(env: ClerkEnv): Promise<PersonalDirectory> {
  return (await personalSongs(env)).directory;
}

function clerkDeletion(result: ClerkResult<null>): ClerkDeletion {
  if (result.ok || result.reason === "not-found") return "deleted";
  return result.definitive ? "refused" : "uncertain";
}

function cleanupSteps(client: PersonalLibrarySql | null, owner: LibraryOwner): ErasureCleanup {
  return {
    purgeLibrary: () => deletePersonalLibraryData(client!, owner),
    deleteUserData: () => deleteUserData(owner.env, owner.userId),
    deleteNotificationData: () => deleteNotificationData(owner.env, owner.userId),
    complete: () => completeErasure(client!, owner),
  };
}

/** Deletes the Clerk account and everything the site holds about the person. */
export async function eraseUserAccount(env: ClerkEnv, userId: string, accountExists: boolean): Promise<ErasureOutcome> {
  const owner: LibraryOwner = { env, userId };
  const client = await erasureClient(env);
  return eraseAccount(
    {
      ...cleanupSteps(client, owner),
      newAttempt: randomUUID,
      async begin(attempt) {
        if (!client) return false;
        await beginErasure(client, owner, attempt);
        return true;
      },
      deleteClerkAccount: async () => clerkDeletion(await deleteAccount(userId)),
      release: (attempt) => releaseErasureAttempt(client!, owner, attempt),
    },
    accountExists,
  );
}

/**
 * Finishes interrupted erasures for this deployment's Clerk instance. Called
 * by the nightly cron. Never throws, and logs counts only.
 */
export async function recoverAccountErasures(): Promise<RecoverySummary | null> {
  const config = currentClerkConfig();
  if (config.status !== "ready" || !process.env.DATABASE_URL) return null;
  const env = config.env;
  try {
    const client = await personalLibraryClient(env);
    const summary = await recoverPendingErasures(
      {
        listPending: (limit) => listPendingErasures(client, env, limit),
        async accountGone(userId) {
          const account = await getAccount(userId);
          if (account.ok) return false;
          return account.reason === "not-found" ? true : null;
        },
        cleanupFor: (userId) => cleanupSteps(client, { env, userId }),
        noteTried: (userId) => noteErasureRecovery(client, { env, userId }),
      },
      RECOVERY_LIMIT,
    );
    if (summary.checked > 0) {
      console.info(`[personal-library] Erasure recovery: ${summary.completed} completed, ${summary.waiting} waiting, ${summary.failed} failed.`);
    }
    return summary;
  } catch (error) {
    console.error("[personal-library] Erasure recovery failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
