import { Card } from "@/components/ui/Card";
import { SheetLink } from "@/components/song-list/SheetLink";
import { songListContent } from "@/content/song-list";
import type { SongListErrorReason } from "@/types/song-list";

/**
 * Error and empty states.
 *
 * Every one of them still offers the spreadsheet link: if the site cannot show
 * the schedule, it should at least hand the visitor somewhere that can. No
 * internal detail, status code or configuration value is ever shown.
 */
export function SongListError({ reason }: { reason: SongListErrorReason }) {
  const { states } = songListContent;
  const notConfigured = reason === "not-configured";

  return (
    <Panel
      title={notConfigured ? states.notConfiguredTitle : states.errorTitle}
      body={notConfigured ? states.notConfiguredBody : states.errorBody}
    />
  );
}

export function SongListEmpty() {
  const { states } = songListContent;
  return <Panel title={states.emptyTitle} body={states.emptyBody} />;
}

function Panel({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center sm:p-12">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>
      <div className="mt-6 flex justify-center">
        <SheetLink />
      </div>
    </Card>
  );
}
