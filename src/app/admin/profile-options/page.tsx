import { NoAccess } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { OptionListEditor } from "@/components/admin/OptionListEditor";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { requireAnyPermission } from "@/lib/auth/session";
import { listOptions } from "@/lib/auth/store";

export const metadata = { title: "Titles & instruments" };

/**
 * /admin/profile-options - the lists behind profiles. Titles are assigned by
 * administrators on each person's page; instruments are chosen by members on
 * their own profile.
 */
export default async function ProfileOptionsPage() {
  const viewer = await requireAnyPermission("/admin/profile-options", ["manage_profiles"]);
  if (!viewer) return <NoAccess />;

  const [titles, instruments] = await Promise.all([
    listOptions(viewer.env, "titles"),
    listOptions(viewer.env, "instruments"),
  ]);

  return (
    <div>
      <SectionHeading as="h1" title="Titles & instruments" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionLabel>Titles</SectionLabel>
          <p className="mt-1 mb-5 text-sm text-muted">
            Positions in the music ministry, such as Pianist or Organist. You assign them on each person&apos;s page.
          </p>
          <OptionListEditor list="titles" items={titles} noun="a title" usageVerb="Held by" />
        </Card>
        <Card className="p-6">
          <SectionLabel>Instruments</SectionLabel>
          <p className="mt-1 mb-5 text-sm text-muted">
            The instruments members can choose on their profile.
          </p>
          <OptionListEditor
            list="instruments"
            items={instruments}
            noun="an instrument"
            usageVerb="Played by"
          />
        </Card>
      </div>
    </div>
  );
}
