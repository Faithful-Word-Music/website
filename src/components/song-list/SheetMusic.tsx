import {
  MemberPreview,
  MembersNote,
  MembersOnlyFiles,
  SheetMusicAccessProvider,
} from "@/components/song-list/MemberSheetMusic";
import { PdfPreview } from "@/components/song-list/PdfPreview";
import { SheetFileButton } from "@/components/song-list/SheetFileButton";
import { Card } from "@/components/ui/Card";
import { songListContent } from "@/content/song-list";
import { currentClerkConfig } from "@/lib/auth/clerk-env";
import type { PublicSheetFile, PublicSheetMusic, PublicVersion } from "@/lib/sheet-music";

const { about, sheetMusic: copy } = songListContent.songPage;

const labelClasses =
  "font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted sm:text-[0.7rem]";

/**
 * What the Sheet Music Index says about the song: composer, words, key,
 * collection and so on. Only filled-in fields are listed; the section is left
 * out when there is nothing to say.
 */
export function AboutSong({ music, className = "mt-12" }: { music: PublicSheetMusic; className?: string }) {
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: string | null) => {
    if (value) rows.push([label, value]);
  };

  add(about.labels.composer, music.composer);
  add(about.labels.lyricist, music.lyricist);
  add(about.labels.keys, music.keys);
  add(about.labels.collection, music.collection);
  add(about.labels.hymnNumber, music.hymnNumber);
  add(about.labels.type, music.type);
  add(about.labels.category, music.category);
  add(about.labels.occasion, music.occasion);
  add(about.labels.source, music.source);
  add(about.labels.copyright, music.copyright && about.copyright[music.copyright]);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="about-song" className={className}>
      <h2 id="about-song" className="font-display text-2xl text-ink">
        {about.title}
      </h2>
      <Card className="mt-4">
        <dl className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className={labelClasses}>{label}</dt>
              <dd className="mt-1 break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

/** One line of the list: a version, for one instrument. */
interface Row {
  key: string;
  label: string;
  detail: string | null;
  files: PublicSheetFile[];
}

/**
 * Each version, split by instrument, labelled so the list reads plainly:
 * "Standard", "Capo · Version 2 · Guitar", "Standard · Piano". The version
 * number is mentioned only when a variant has more than one.
 */
function toRows(versions: PublicVersion[]): Row[] {
  const perVariant = new Map<string, number>();
  for (const version of versions) {
    perVariant.set(version.variant, (perVariant.get(version.variant) ?? 0) + 1);
  }

  return versions.flatMap((version) => {
    const instruments = [...new Set(version.files.map((file) => file.instrument))];
    return instruments.map((instrument): Row => {
      const parts = [version.variant];
      if ((perVariant.get(version.variant) ?? 0) > 1) {
        parts.push(copy.version.replace("{version}", version.version));
      }
      if (instrument) parts.push(instrument);

      const detail = [
        version.keys && copy.key.replace("{key}", version.keys),
        version.capoFret && copy.capo.replace("{fret}", version.capoFret),
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        key: `${version.variant}|${version.version}|${instrument ?? ""}`,
        label: parts.join(" · "),
        detail: detail || null,
        files: version.files.filter((file) => file.instrument === instrument),
      };
    });
  });
}

/**
 * One row's buttons: files anyone may open, then members-only files (unlocked
 * in the browser for signed-in members), then anything nobody may open here,
 * named but not linked.
 */
function FileActions({ files }: { files: PublicSheetFile[] }) {
  const open = files.filter((file) => file.href);
  const members = files.filter((file) => file.membersHref);
  const closed = files.filter((file) => !file.href && !file.membersHref);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {open.map((file) => (
        <SheetFileButton key={file.href} format={file.format} href={file.href!} />
      ))}
      {members.length > 0 ? <MembersOnlyFiles files={members} /> : null}
      {closed.length > 0 ? (
        <span className="text-sm text-muted">
          {[...new Set(closed.map((file) => copy.formats[file.format]))].join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The song's sheet music from the Index. Files the visitor may open get a
 * button - "View PDF" first, "Download MuseScore" second - and the first PDF
 * is previewed in the page on every screen size (see PdfPreview).
 *
 * Copyrighted files are listed for everyone and unlocked for signed-in
 * members (see MemberSheetMusic). The route behind each link checks access
 * again, so hiding a button here is a courtesy, not the protection.
 */
export function SheetMusic({
  music,
  title,
  className = "mt-12",
}: {
  music: PublicSheetMusic;
  title: string;
  className?: string;
}) {
  const rows = toRows(music.versions);
  if (rows.length === 0) return null;

  // The first PDF anyone may open, named as its row is ("Standard") - or,
  // failing that, the first members' PDF, previewed once a member is known.
  const publicPreview = rows
    .map((row) => ({ label: row.label, href: row.files.find((file) => file.format === "pdf" && file.href)?.href }))
    .find((candidate) => candidate.href);
  const memberPreview = publicPreview
    ? undefined
    : rows
        .map((row) => ({
          label: row.label,
          href: row.files.find((file) => file.format === "pdf" && file.membersHref)?.membersHref,
        }))
        .find((candidate) => candidate.href);

  // Members' files need accounts switched on in this deployment; without
  // them the page reads exactly as it did before accounts existed.
  const membersEnabled = music.membersOnly && currentClerkConfig().status === "ready";

  const content = (
    <section aria-labelledby="sheet-music" className={className}>
      <h2 id="sheet-music" className="font-display text-2xl text-ink">
        {copy.title}
      </h2>
      {membersEnabled ? (
        <MembersNote hasPublicFiles={music.available} />
      ) : music.available ? null : (
        <p className="mt-2 text-muted">{copy.restricted}</p>
      )}

      {publicPreview?.href ? (
        <PdfPreview src={publicPreview.href} title={title} label={publicPreview.label} />
      ) : memberPreview?.href && membersEnabled ? (
        <MemberPreview src={memberPreview.href} title={title} label={memberPreview.label} />
      ) : null}

      <Card className="mt-4">
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <span className="min-w-0">
                <span className="block text-ink">{row.label}</span>
                {row.detail ? <span className="block text-xs text-muted">{row.detail}</span> : null}
              </span>
              <FileActions files={row.files} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );

  return membersEnabled ? <SheetMusicAccessProvider>{content}</SheetMusicAccessProvider> : content;
}
