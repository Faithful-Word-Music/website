import { PdfPreview } from "@/components/song-list/PdfPreview";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { songListContent } from "@/content/song-list";
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

function PdfIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9.5 1.5ZM9.5 1.5V5H13M5.5 8.5h5M5.5 11h5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** PDF first and filled; MuseScore second and outlined. */
function FileActions({ files }: { files: PublicSheetFile[] }) {
  const open = files.filter((file) => file.href);
  const closed = files.filter((file) => !file.href);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {open.map((file) =>
        file.format === "pdf" ? (
          <a
            key={file.href}
            href={file.href!}
            target="_blank"
            rel="noopener"
            className={buttonClasses("primary")}
          >
            <PdfIcon />
            {copy.viewPdf}
            <span className="sr-only">{copy.newTab}</span>
          </a>
        ) : (
          <a
            key={file.href}
            href={file.href!}
            download
            title={copy.museScoreHint}
            className={buttonClasses("secondary")}
          >
            <DownloadIcon />
            {copy.downloadMuseScore}
          </a>
        ),
      )}
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
 * When nothing may be shared publicly the versions are still listed, with a
 * short note and no links. The route behind each link checks rights again,
 * so hiding a button here is a courtesy, not the protection.
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

  // The first PDF this visitor may open, named as its row is ("Standard").
  const preview = rows
    .map((row) => ({ label: row.label, href: row.files.find((file) => file.format === "pdf")?.href }))
    .find((candidate) => candidate.href);

  return (
    <section aria-labelledby="sheet-music" className={className}>
      <h2 id="sheet-music" className="font-display text-2xl text-ink">
        {copy.title}
      </h2>
      {music.available ? null : <p className="mt-2 text-muted">{copy.restricted}</p>}

      {preview?.href ? <PdfPreview src={preview.href} title={title} label={preview.label} /> : null}

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
}
