import { NoAccess } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { OptionListEditor } from "@/components/admin/OptionListEditor";
import { SheetMusicTypeListEditor } from "@/components/admin/SheetMusicTypeListEditor";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { requireAnyPermission } from "@/lib/auth/session";
import { expandSheetMusicSources, listOptions, listSheetMusicTypes } from "@/lib/auth/store";
import { classify, FORMAT_FOLDERS, foldersOwned, sourceCoverage } from "@/lib/sheet-music";
import { getSheetMusicSources } from "@/lib/sheet-music-index";
import { describeSource, songCount } from "@/lib/sheet-music-type";

export const metadata = { title: "Configuration" };

/**
 * /admin/configuration - the lists that shape the site. Each section shows
 * only for its own permission: the sheet music types offered
 * (manage_sheet_music), and the titles and instruments behind profiles
 * (manage_profiles).
 */
export default async function ConfigurationPage() {
  const viewer = await requireAnyPermission("/admin/configuration", ["manage_profiles", "manage_sheet_music"]);
  if (!viewer) return <NoAccess />;

  const managesSheetMusic = viewer.can("manage_sheet_music");
  const managesProfiles = viewer.can("manage_profiles");
  // eslint-disable-next-line prefer-const -- reassigned once the sources are expanded
  let [sheetTypes, sheetDrive, titles, instruments] = await Promise.all([
    managesSheetMusic ? listSheetMusicTypes(viewer.env) : null,
    managesSheetMusic ? getSheetMusicSources() : null,
    managesProfiles ? listOptions(viewer.env, "titles") : null,
    managesProfiles ? listOptions(viewer.env, "instruments") : null,
  ]);
  const drive = sheetDrive?.ok ? sheetDrive.sources : null;
  // The starting types' "every … folder" sources become the folders they stand
  // for, so every type is just a list of folders (see expandSheetMusicSources).
  const seeded = sheetTypes;
  if (drive && seeded && (await expandSheetMusicSources(viewer.env, (source) => foldersOwned(drive, seeded, source)))) {
    sheetTypes = await listSheetMusicTypes(viewer.env);
  }
  const index = drive && sheetTypes ? classify(drive, sheetTypes) : null;

  return (
    <div>
      <SectionHeading as="h1" title="Configuration" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {sheetTypes ? (
          <section id="sheet-music" className="min-w-0 scroll-mt-24 lg:col-span-2">
            <Card className="h-full p-4 sm:p-6">
              <SectionLabel>Sheet music types</SectionLabel>
              <p className="mt-1 mb-5 text-sm text-muted">
                The types you can give each person on their page. Their Dashboard links that type under each upcoming
                song, and song pages group sheet music under these names. Each type takes every PDF and MuseScore
                file in its folders, including the folders inside them. If a folder sits inside another type&apos;s
                folder, the files go to the type with the folder closest to them.
              </p>
              <SheetMusicTypeListEditor
                types={sheetTypes.map((type) => ({
                  id: type.id,
                  label: type.label,
                  usage: type.usage,
                  songs: index ? songCount(index.songs, type.id) : null,
                  sources: type.storedSources.map((source) => {
                    const coverage = drive ? sourceCoverage(drive, source.path) : null;
                    return {
                      id: source.id,
                      description: describeSource(source.path),
                      folders: coverage?.folders.length ?? null,
                    };
                  }),
                }))}
                folders={
                  // PDF and MuseScore folders are never chosen: a source always takes both.
                  drive?.folders.filter((folder) => !folder.path.some((name) => FORMAT_FOLDERS.has(name.toLowerCase()))) ??
                  null
                }
              />
            </Card>
          </section>
        ) : null}
        {titles ? (
          <section id="titles" className="min-w-0 scroll-mt-24">
            <Card className="h-full p-4 sm:p-6">
              <SectionLabel>Titles</SectionLabel>
              <p className="mt-1 mb-5 text-sm text-muted">
                Positions in the music ministry, such as Pianist or Organist. You assign them on each person&apos;s
                page.
              </p>
              <OptionListEditor list="titles" items={titles} noun="a title" usageVerb="Held by" />
            </Card>
          </section>
        ) : null}
        {instruments ? (
          <section id="instruments" className="min-w-0 scroll-mt-24">
            <Card className="h-full p-4 sm:p-6">
              <SectionLabel>Instruments</SectionLabel>
              <p className="mt-1 mb-5 text-sm text-muted">The instruments members can choose on their profile.</p>
              <OptionListEditor list="instruments" items={instruments} noun="an instrument" usageVerb="Played by" />
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}
