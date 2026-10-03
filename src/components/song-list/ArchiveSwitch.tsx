import { AdminNav } from "@/components/admin/AdminNav";
import { songListContent } from "@/content/song-list";

const { views } = songListContent.archive;

/** Songs | Service plans - the archive's two views of the same history. */
export function ArchiveSwitch() {
  return (
    <AdminNav
      label={views.label}
      items={[
        { href: "/song-list/archive", label: views.songs },
        { href: "/song-list/archive/services", label: views.services },
      ]}
    />
  );
}
