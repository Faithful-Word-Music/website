"use client";

import { supportContent } from "@/content/support";

import { ReportLink } from "./ReportLink";

/** On a song's page, for a signed-in member: report a problem with it, or ask for sheet music it lacks. */
export function SongReportLinks({ songId, className }: { songId: string; className?: string }) {
  return (
    <p className={className}>
      <span className="flex flex-wrap gap-x-5 gap-y-2">
        <ReportLink entry="problem" category="wrong_sheet_music" refs={{ song: songId }} className="text-sm">
          {supportContent.report.problem}
        </ReportLink>
        <ReportLink entry="sheet_music" category="missing_sheet_music" refs={{ song: songId }} className="text-sm">
          {supportContent.report.sheetMusic}
        </ReportLink>
      </span>
    </p>
  );
}
