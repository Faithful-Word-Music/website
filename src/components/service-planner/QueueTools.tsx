"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSpecialService } from "@/app/service-planner/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { Dialog } from "@/components/availability/Dialog";
import { Button, buttonClasses } from "@/components/ui/Button";
import { servicePlannerContent } from "@/content/service-planner";
import type { ActionResult } from "@/lib/auth/session";

import { Panel } from "./Panel";

const copy = servicePlannerContent;

/** "New special service": a conference, holiday or other one-off, placed on the planner straight away. */
export function NewSpecialService({ today, className }: { today: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<"AM" | "PM">("PM");
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("19:00");
  const [songs, setSongs] = useState(4);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  function create() {
    setResult(null);
    startTransition(async () => {
      const outcome = await createSpecialService({ date, slot, label, time, songs });
      setResult(outcome);
      if (outcome.ok) {
        setOpen(false);
        router.push(`/service-planner/${outcome.value.anchor}`);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className={className}>
        {copy.queue.newSpecial}
      </Button>
      {open ? (
        <Dialog
          title={copy.special.title}
          subtitle={copy.special.lead}
          closeLabel={copy.special.cancel}
          onClose={() => setOpen(false)}
          footer={
            <>
              <ActionMessage result={result} />
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                {copy.special.cancel}
              </Button>
              <Button type="button" onClick={create} disabled={pending || label.trim() === ""}>
                {copy.special.create}
              </Button>
            </>
          }
        >
          <TextField
            id="special-label"
            label={copy.special.label}
            placeholder={copy.special.labelPlaceholder}
            value={label}
            maxLength={80}
            onChange={setLabel}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="special-date" label={copy.special.date} type="date" value={date} maxLength={10} onChange={setDate} />
            <TextField id="special-time" label={copy.special.time} type="time" value={time} maxLength={5} onChange={setTime} />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">{copy.special.slot}</legend>
            <div className="flex gap-2">
              {(["AM", "PM"] as const).map((value) => (
                <label
                  key={value}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-4 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/40"
                >
                  <input
                    type="radio"
                    name="special-slot"
                    className="sr-only"
                    checked={slot === value}
                    onChange={() => {
                      setSlot(value);
                      setTime(value === "AM" ? "10:30" : "19:00");
                    }}
                  />
                  {copy.special.slots[value]}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            id="special-songs"
            label={copy.special.songs}
            type="number"
            value={String(songs)}
            maxLength={2}
            onChange={(value) => setSongs(Math.max(0, Math.min(20, Number(value) || 0)))}
          />
        </Dialog>
      ) : null}
    </>
  );
}

/**
 * Exports - one-way copies of the planner as spreadsheets and PDFs, for a
 * date range. Plain links to the export route, so the browser downloads them.
 */
export function ExportPanel({ from, to }: { from: string; to: string }) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [drafts, setDrafts] = useState(false);
  const href = (format: string) => {
    const params = new URLSearchParams({ format, from: start, to: end });
    if (drafts) params.set("drafts", "1");
    return `/service-planner/export?${params}`;
  };

  return (
    <Panel title={copy.export.title} lead={copy.export.lead} collapsible>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="export-from" label={copy.export.from} type="date" value={start} maxLength={10} onChange={setStart} />
          <TextField id="export-to" label={copy.export.to} type="date" value={end} maxLength={10} onChange={setEnd} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={drafts} onChange={() => setDrafts(!drafts)} className="h-4 w-4" />
          {copy.export.includeDrafts}
        </label>
        <ul className="grid gap-2">
          {(
            [
              ["formatted-pdf", copy.export.formattedPdf],
              ["formatted-xlsx", copy.export.formattedXlsx],
              ["raw-xlsx", copy.export.rawXlsx],
              ["raw-csv", copy.export.rawCsv],
            ] as const
          ).map(([format, label]) => (
            <li key={format}>
              {/* A download, not a page: a plain link, so the router does not try to render it. */}
              <a
                href={href(format)}
                className={buttonClasses("secondary", "md", "w-full")}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
