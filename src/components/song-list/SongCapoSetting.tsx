"use client";

import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/AccountContext";
import { ActionMessage } from "@/components/account/fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { useAction, type ActionOutcome } from "@/components/ui/use-action";
import { feedbackContent } from "@/content/feedback";
import { songListContent } from "@/content/song-list";
import { SONG_CAPO_RULES, type SongCapoRule } from "@/lib/capo-policy";
import { keySignature } from "@/lib/key-signature";
import { plural } from "@/lib/plural";

const { capo: copy, signature: words } = songListContent.songPage;

/** What /api/account/song-capo answers with. */
interface CapoState {
  rule: SongCapoRule;
  key: string | null;
  required: boolean;
  policyRequires: boolean;
  type: string | null;
}

function parseState(data: unknown): CapoState | null {
  const value = data as (Partial<CapoState> & { ok?: unknown }) | null;
  if (!value || value.ok !== true || !SONG_CAPO_RULES.includes(value.rule as SongCapoRule)) return null;
  return {
    rule: value.rule as SongCapoRule,
    key: typeof value.key === "string" ? value.key : null,
    required: value.required === true,
    policyRequires: value.policyRequires === true,
    type: typeof value.type === "string" ? value.type : null,
  };
}

/** "E♭ · 3 flats", or just the key when its signature cannot be read. */
function describeKey(key: string): string {
  const signature = keySignature(key);
  if (!signature) return key;
  const size =
    signature.count === 0
      ? words.none
      : plural(signature.count > 0 ? words.sharps : words.flats, Math.abs(signature.count));
  return `${key} · ${size.charAt(0).toLowerCase()}${size.slice(1)}`;
}

/**
 * Whether this song needs capo sheet music, and the setting that decides it
 * for this one song: follow the site's policy, always, or never
 * (src/lib/capo-policy.ts). Only for people who look after the sheet music
 * (manage_sheet_music) - the page is static and the same for everyone, so
 * this asks /api/account/song-capo once it knows who is looking, and shows
 * nothing to anyone else. The route checks the permission again.
 */
export function SongCapoSetting({ title, number, className }: { title: string; number: string | null; className?: string }) {
  const { me } = useAccount();
  const allowed = Boolean(me?.permissions.includes("manage_sheet_music"));
  const [state, setState] = useState<CapoState | null>(null);
  const [choice, setChoice] = useState<SongCapoRule>("global");
  const { pending, result, clear, run, stateOf } = useAction();

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ title, ...(number ? { number } : {}) });
    fetch(`/api/account/song-capo?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const loaded = parseState(data);
        if (!loaded) return;
        setState(loaded);
        setChoice(loaded.rule);
      })
      .catch(() => {
        // Offline, or left the page: the control simply does not appear.
      });
    return () => controller.abort();
  }, [allowed, title, number]);

  if (!allowed || !state) return null;

  const save = () =>
    run(
      async (): Promise<ActionOutcome> => {
        const response = await fetch("/api/account/song-capo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, number, rule: choice }),
        });
        const saved = parseState(await response.json().catch(() => null));
        if (!saved) return { ok: false, error: feedbackContent.failed };
        setState(saved);
        return { ok: true, message: copy.saved };
      },
      // The page itself is the same for everyone; nothing on it changes.
      { refresh: false },
    );

  const outcome = state.required ? copy.required : copy.notRequired;
  const reason =
    state.rule !== "global"
      ? copy.reasonSong
      : state.key
        ? copy.reasonPolicy.replace("{key}", describeKey(state.key))
        : copy.reasonNoKey;

  return (
    <Card className={cn("px-5 py-5 sm:px-6", className)}>
      <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{copy.title}</h2>
      <p className="mt-2 text-ink">
        <span className="font-medium">{outcome}</span>
        <span className="text-muted"> · {reason}</span>
      </p>
      {state.type === null ? <p className="mt-1 text-sm text-muted">{copy.noType}</p> : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <label htmlFor="song-capo-rule" className="mb-1.5 block text-sm font-medium text-ink">
            {copy.label}
          </label>
          <select
            id="song-capo-rule"
            value={choice}
            onChange={(event) => {
              clear();
              setChoice(event.target.value as SongCapoRule);
            }}
            className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-muted/50"
          >
            {SONG_CAPO_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {rule === "global"
                  ? copy.rules.global.replace("{outcome}", state.policyRequires ? copy.policyYes : copy.policyNo)
                  : copy.rules[rule]}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          state={stateOf()}
          pendingLabel={feedbackContent.saving}
          doneLabel={feedbackContent.saved}
          disabled={pending || choice === state.rule}
          onClick={save}
        >
          {copy.save}
        </Button>
      </div>
      <div className="mt-2 empty:hidden">
        <ActionMessage result={result} />
      </div>
      <p className="mt-3 text-xs text-muted">{copy.note}</p>
    </Card>
  );
}
