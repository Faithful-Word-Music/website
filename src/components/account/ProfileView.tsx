import type { ReactNode } from "react";

import { LearningScaleDisplay } from "@/components/account/LearningScale";
import { Card } from "@/components/ui/Card";
import { MUSICIAN_ROLE, SONG_LEADER_ROLE } from "@/lib/auth/permissions";
import {
  LEARNING_STYLES,
  PROFICIENCIES,
  SERVICE_AVAILABILITY,
  THEORY_LEVELS,
  VOICE_PARTS,
  labelOf,
} from "@/lib/auth/profile-options";
import type { ProfileData, UserInstrument, UserTitle } from "@/lib/auth/store";

/**
 * A member's profile, as shown to themselves on /account and to
 * administrators on /admin/users/[id]. Both pages check who may see it before
 * rendering this.
 */
export function ProfileView({
  person,
  profile,
  instruments,
  titles,
  roleKeys,
  roleLabels,
  actions,
}: {
  person: { firstName: string; lastName: string; email: string | null; imageUrl: string };
  profile: ProfileData;
  instruments: UserInstrument[];
  titles: UserTitle[];
  roleKeys: string[];
  roleLabels: string[];
  actions?: ReactNode;
}) {
  const fullName =
    [person.firstName, profile.middleName, person.lastName].filter(Boolean).join(" ") || person.email || "Unnamed";
  const primaryTitle = titles.find((title) => title.isPrimary) ?? titles[0];
  const otherTitles = titles.filter((title) => title !== primaryTitle);
  const isMusician = roleKeys.includes(MUSICIAN_ROLE);
  const isSongLeader = roleKeys.includes(SONG_LEADER_ROLE);
  const learning = LEARNING_STYLES.find((style) => style.value === profile.learningStyle);

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo */}
          <img
            src={person.imageUrl}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-full border border-line object-cover"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl text-ink">{fullName}</h2>
            {profile.preferredName ? (
              <p className="mt-1 text-sm text-muted">Goes by {profile.preferredName}</p>
            ) : null}
            {primaryTitle ? (
              <p className="mt-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                {[primaryTitle, ...otherTitles].map((title) => title.label).join(" · ")}
              </p>
            ) : null}
            {person.email ? <p className="mt-2 truncate text-sm text-muted">{person.email}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </div>
        {profile.bio ? (
          <p className="mt-6 whitespace-pre-line border-t border-line pt-6 leading-relaxed text-ink">{profile.bio}</p>
        ) : null}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <SectionLabel>Instruments</SectionLabel>
          {instruments.length > 0 ? (
            <ul className="mt-3 divide-y divide-line">
              {instruments.map((instrument) => (
                <li key={instrument.instrumentId} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="text-ink">
                    {instrument.label}
                    {instrument.isPrimary ? <span className="ml-2 text-xs text-gold-dark">Primary</span> : null}
                  </span>
                  <span className="text-muted">{labelOf(PROFICIENCIES, instrument.proficiency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No instruments yet.</Empty>
          )}
        </Card>

        <Card className="p-6">
          <SectionLabel>Music</SectionLabel>
          <dl className="mt-3 space-y-3 text-sm">
            <Row label="Voice part" value={labelOf(VOICE_PARTS, profile.voicePart)} />
            {isMusician || profile.learningStyle !== null ? (
              <Row label="Plays" value={learning ? learning.label : null}>
                {learning ? <LearningScaleDisplay value={learning.value} /> : null}
              </Row>
            ) : null}
            {isMusician || profile.theoryLevel !== null ? (
              <Row label="Music theory" value={labelOf(THEORY_LEVELS, profile.theoryLevel)} />
            ) : null}
            {isSongLeader || profile.readsSheetMusic !== null ? (
              <Row
                label="Reads basic sheet music"
                value={profile.readsSheetMusic === null ? null : profile.readsSheetMusic ? "Yes" : "No"}
              />
            ) : null}
          </dl>
        </Card>

        <Card className="p-6">
          <SectionLabel>Usually available</SectionLabel>
          {profile.serviceAvailability.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {SERVICE_AVAILABILITY.filter((slot) => profile.serviceAvailability.includes(slot.value)).map((slot) => (
                <li key={slot.value} className="rounded-full border border-line px-3 py-1 text-sm text-ink">
                  {slot.label}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Not given.</Empty>
          )}
        </Card>

        <Card className="p-6">
          <SectionLabel>Account</SectionLabel>
          <dl className="mt-3 space-y-3 text-sm">
            <Row label="Roles" value={roleLabels.join(", ") || "Member"} />
            <Row label="Phone" value={profile.phone || null} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">{children}</h3>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm text-muted">{children}</p>;
}

function Row({ label, value, children }: { label: string; value: string | null; children?: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value ?? <span className="text-muted">Not given</span>}</dd>
      {children}
    </div>
  );
}
