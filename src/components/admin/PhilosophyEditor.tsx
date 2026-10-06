"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { savePhilosophyAction } from "@/app/admin/actions";
import { ActionMessage, TextField } from "@/components/account/fields";
import { SectionLabel } from "@/components/account/ProfileView";
import { ArrowIcon, IconButton } from "@/components/admin/OptionListEditor";
import { Pill } from "@/components/admin/StatusPill";
import { ConductorMarkdown } from "@/components/conductor/ConductorMarkdown";
import { copyText } from "@/components/song-list/share-actions";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { Collapse } from "@/components/ui/Collapse";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/use-action";
import { useUnsavedGuard } from "@/components/ui/use-unsaved-guard";
import { aiContent } from "@/content/ai";
import { feedbackContent } from "@/content/feedback";
import { composePhilosophy, PHILOSOPHY_EDIT_LIMITS, type PhilosophyDraft } from "@/lib/ai/planning/revisions";
import { plural } from "@/lib/plural";

const content = aiContent.admin.philosophy;
const words = feedbackContent;

interface Row {
  /** Stable while the section is on the page, whatever its heading becomes. */
  key: string;
  title: string;
  text: string;
  /** As it stands in the version in force; null for a section added here. */
  saved: { title: string; text: string } | null;
  removed: boolean;
}

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();
const isChanged = (row: Row) => !row.saved || row.removed || row.saved.title !== row.title.trim() || squeeze(row.saved.text) !== squeeze(row.text);

/**
 * Admin -> AI -> Planning Philosophy: the document as its own sections, each
 * read as it will be read by the AI and edited in place. Nothing is applied
 * until Save changes, which makes ONE new version of the whole document
 * (savePhilosophyAction) - on top of the version this editor was opened on,
 * so two people editing at once cannot silently overwrite each other.
 *
 * Without `canEdit` it is the same page to read.
 */
export function PhilosophyEditor({
  draft,
  revisionId,
  canEdit,
  readOnlyNote,
  maxChars,
}: {
  draft: PhilosophyDraft;
  /** The version in force that this was opened on. */
  revisionId: number | null;
  canEdit: boolean;
  /** Why it cannot be edited, when that is for want of permission. */
  readOnlyNote: string | null;
  maxChars: number;
}) {
  const ids = useId();
  const added = useRef(0);
  const initial = useMemo(
    (): Row[] => draft.sections.map((section, index) => ({ key: `s${index}`, title: section.title, text: section.text, saved: { ...section }, removed: false })),
    [draft],
  );
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const { pending, result, run, stateOf, clear } = useAction();

  const kept = rows.filter((row) => !row.removed);
  const changed = rows.filter(isChanged).length;
  const reordered =
    rows.filter((row) => row.saved && !row.removed).map((row) => row.key).join("|") !==
    initial.filter((row) => rows.some((item) => item.key === row.key && !item.removed)).map((row) => row.key).join("|");
  const dirty = changed > 0 || reordered;
  const length = composePhilosophy({ title: draft.title, sections: kept }).length;
  const tooLong = length > maxChars;
  const guard = useUnsavedGuard(dirty && !pending);

  const update = (key: string, change: Partial<Row>) => {
    clear();
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  function move(key: string, direction: -1 | 1) {
    clear();
    setRows((list) => {
      const from = list.findIndex((row) => row.key === key);
      // Past any removed section, to the next one that is staying.
      let to = from + direction;
      while (to >= 0 && to < list.length && list[to].removed) to += direction;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function addSection() {
    clear();
    added.current += 1;
    const key = `new${added.current}`;
    setRows((list) => [...list, { key, title: content.newSection, text: "", saved: null, removed: false }]);
    setOpen(key);
  }

  function remove(row: Row) {
    clear();
    // A section added here and thought better of simply goes.
    if (!row.saved) setRows((list) => list.filter((item) => item.key !== row.key));
    else update(row.key, { removed: true });
    setOpen(null);
  }

  function discard() {
    clear();
    setRows(initial);
    setNote("");
    setOpen(null);
  }

  const save = () =>
    void run(
      () =>
        savePhilosophyAction({
          title: draft.title,
          sections: kept.map((row) => ({ title: row.title, text: row.text })),
          note,
          baseRevisionId: revisionId,
        }),
      { key: "save", onOk: () => setNote("") },
    );

  return (
    <div className="mt-8">
      {readOnlyNote ? <p className="mb-5 max-w-3xl text-sm text-muted">{readOnlyNote}</p> : null}
      {canEdit ? <p className="mb-5 max-w-3xl text-sm text-muted">{content.editing}</p> : null}

      <ol className="space-y-3">
        {rows.map((row) => {
          const position = kept.indexOf(row);
          const editing = open === row.key;
          const name = row.title.trim() || content.newSection;

          return (
            <li key={row.key}>
              <Card className={cn("overflow-hidden", row.removed && "opacity-60")}>
                <div className="flex items-start gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 py-1.5">
                    <h2 className={cn("break-words font-display text-xl text-ink", row.removed && "line-through")}>{name}</h2>
                    {row.removed ? (
                      <p className="mt-1 text-sm text-muted">{content.removed}</p>
                    ) : isChanged(row) ? (
                      <p className="mt-1.5">
                        <Pill tone="warning">{row.saved ? content.changed : content.added}</Pill>
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center">
                      {row.removed ? (
                        <Button type="button" variant="quiet" onClick={() => update(row.key, { removed: false })} className="px-3">
                          {content.restoreSection}
                        </Button>
                      ) : (
                        <>
                          <IconButton label={content.moveUp.replace("{section}", name)} disabled={pending || position <= 0} onClick={() => move(row.key, -1)}>
                            <ArrowIcon direction="up" />
                          </IconButton>
                          <IconButton
                            label={content.moveDown.replace("{section}", name)}
                            disabled={pending || position === kept.length - 1}
                            onClick={() => move(row.key, 1)}
                          >
                            <ArrowIcon direction="down" />
                          </IconButton>
                          <Button
                            type="button"
                            variant="quiet"
                            aria-expanded={editing}
                            aria-controls={`${ids}-${row.key}`}
                            onClick={() => setOpen(editing ? null : row.key)}
                            className="px-3"
                          >
                            {editing ? content.doneEditing : content.edit}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Read as the AI is given it; the box to change it opens in its place. */}
                {!row.removed && !editing && row.text.trim() !== "" ? (
                  <div className="border-t border-line px-4 py-4 sm:px-5">
                    <ConductorMarkdown text={row.text} />
                  </div>
                ) : null}

                {canEdit && !row.removed ? (
                  <Collapse open={editing} id={`${ids}-${row.key}`}>
                    <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
                      <TextField
                        id={`${ids}-${row.key}-title`}
                        label={content.sectionTitle}
                        value={row.title}
                        maxLength={PHILOSOPHY_EDIT_LIMITS.titleChars}
                        onChange={(value) => update(row.key, { title: value })}
                      />
                      <TextField
                        id={`${ids}-${row.key}-text`}
                        label={content.sectionText}
                        value={row.text}
                        maxLength={maxChars}
                        multiline
                        rows={Math.min(24, Math.max(8, Math.ceil(row.text.length / 70)))}
                        onChange={(value) => update(row.key, { text: value })}
                      />
                      <Button type="button" variant="quiet" onClick={() => remove(row)} className="-ml-5">
                        {content.removeSection}
                      </Button>
                    </div>
                  </Collapse>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>

      {canEdit ? (
        <>
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={addSection} disabled={pending}>
              {content.addSection}
            </Button>
          </div>

          {/* The page's own bar of actions, like the planner's: Conductor's button moves up out of its way
              (data-action-bar, globals.css) - and from lg, where that button drops back to the corner, the
              bar stops short of it. */}
          <div data-action-bar="" className="sticky bottom-4 z-10 mt-8 lg:mr-20">
           <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-lift sm:px-5">
            <Collapse open={dirty}>
              <div className="mb-4 max-w-xl">
                <TextField
                  id={`${ids}-note`}
                  label={content.noteLabel}
                  hint={content.noteHint}
                  placeholder={content.notePlaceholder}
                  value={note}
                  maxLength={PHILOSOPHY_EDIT_LIMITS.noteChars}
                  onChange={setNote}
                />
              </div>
            </Collapse>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button type="button" state={stateOf("save")} pendingLabel={words.saving} doneLabel={words.saved} disabled={pending || !dirty || tooLong} onClick={save}>
                {content.save}
              </Button>
              {dirty ? (
                <Button type="button" variant="quiet" onClick={discard} disabled={pending} className="px-0">
                  {content.discard}
                </Button>
              ) : null}
              <p className={cn("tnum text-xs", tooLong ? "text-gold-dark" : "text-muted")}>
                {tooLong
                  ? content.tooLong
                  : dirty
                    ? changed > 0
                      ? plural(content.unsaved, changed)
                      : content.unsavedOrder
                    : content.length.replace("{count}", length.toLocaleString("en-US")).replace("{max}", maxChars.toLocaleString("en-US"))}
              </p>
            </div>
            {result ? (
              <div className="mt-3">
                <ActionMessage result={result} />
              </div>
            ) : null}
           </div>
          </div>
        </>
      ) : null}

      <Card className="mt-10 p-4 sm:p-6">
        <SectionLabel>{content.ask.heading}</SectionLabel>
        <p className="mt-1 max-w-3xl text-sm text-muted">{content.ask.body}</p>
        <p className="mt-4 max-w-3xl whitespace-pre-wrap break-words rounded-lg border border-line bg-paper px-3.5 py-3 text-sm text-ink-soft">{content.ask.prompt}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/conductor" className={buttonClasses("secondary")}>
            {content.ask.link}
          </Link>
          <Button
            type="button"
            variant="quiet"
            onClick={async () => {
              setCopied(await copyText(content.ask.prompt));
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? content.ask.copied : content.ask.copy}
          </Button>
        </div>
      </Card>

      {guard.pending ? (
        <Modal
          title={content.discard}
          closeLabel={content.history.confirmNo}
          onClose={guard.stay}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={guard.stay}>
                {content.history.confirmNo}
              </Button>
              <Button type="button" onClick={guard.leave}>
                {content.discard}
              </Button>
            </>
          }
        >
          <p className="text-ink-soft">{changed > 0 ? plural(content.unsaved, changed) : content.unsavedOrder}.</p>
        </Modal>
      ) : null}
    </div>
  );
}
