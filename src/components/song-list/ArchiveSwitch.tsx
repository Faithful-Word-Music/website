import { SectionNav } from "@/components/ui/SectionNav";
import { songListContent } from "@/content/song-list";

const { views } = songListContent.archive;

/** Songs | Service plans - the archive's two views of the same history. */
export function ArchiveSwitch() {
  return (
    <SectionNav
      label={views.label}
      items={[
        { href: "/song-list/archive", label: views.songs },
        { href: "/song-list/archive/services", label: views.services },
      ]}
    />
  );
}
