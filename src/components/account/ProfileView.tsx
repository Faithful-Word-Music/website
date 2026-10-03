import Link from "next/link";
import type { ReactNode } from "react";

import { LearningScaleDisplay } from "@/components/account/LearningScale";
import { Card } from "@/components/ui/Card";
import {
  LEARNING_STYLES,
  PROFICIENCIES,
  SERVICE_AVAILABILITY,
  THEORY_LEVELS,
  VOICE_PARTS,
  labelOf,
} from "@/lib/auth/profile-options";
import type { VisibleProfile } from "@/lib/auth/profile-visibility";

/**
 * A member's profile, as one audience sees it: the owner on /profile,
 * administrators on /admin/users/[id], and later other members on /people.
 *
 * It shows whatever it is given. Deciding what that is happens before, on
 * the server, through visibleProfile() (src/lib/auth/profile-visibility.ts):
 * a field the audience may not see is absent, and its row or card is left
 * out. A field that is present but empty shows as "Not given".
 */
export function ProfileView({
  profile,
  isMusician = false,
  availabilityHref,
  actions,
}: {
  profile: VisibleProfile;
  /** Musicians are asked "How do you play?", so it shows even when unanswered. */
  isMusician?: boolean;
  /**
   * Where normal availability is changed (/availability), for someone who
   * may change it. Availability is only shown here, never edited.
   */
  availabilityHref?: string;
  actions?: ReactNode;
}) {
  const fullName =
    [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ") || profile.email || "Unnamed";
  const titles = profile.titles ?? [];
  const primaryTitle = titles.find((title) => title.isPrimary) ?? titles[0];
  const orderedTitles = primaryTitle ? [primaryTitle, ...titles.filter((title) => title !== primaryTitle)] : [];
  const learning = LEARNING_STYLES.find((style) => style.value === profile.learningStyle);

  const showsMusic =
    profile.voicePart !== undefined ||
    profile.readsSheetMusic !== undefined ||
    profile.learningStyle !== undefined ||
    profile.theoryLevel !== undefined;
  const showsDetails = profile.roleLabels !== undefined || profile.phone !== undefined;

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {profile.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo
            <img
              src={profile.imageUrl}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 rounded-full border border-line object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl text-ink">{fullName}</h2>
            {profile.preferredName ? (
              <p className="mt-1 text-sm text-muted">Goes by {profile.preferredName}</p>
            ) : null}
            {orderedTitles.length > 0 ? (
              <p className="mt-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                {orderedTitles.map((title) => title.label).join(" · ")}
              </p>
            ) : null}
            {profile.email ? <p className="mt-2 truncate text-sm text-muted">{profile.email}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </div>
        {profile.bio ? (
          <p className="mt-6 whitespace-pre-line border-t border-line pt-6 leading-relaxed text-ink">{profile.bio}</p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {profile.instruments ? (
          <Card className="p-6">
            <SectionLabel>Instruments</SectionLabel>
            {profile.instruments.length > 0 ? (
              <ul className="mt-3 divide-y divide-line">
                {profile.instruments.map((instrument) => (
                  <li key={instrument.instrumentId} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span className="text-ink">
                      {instrument.label}
                      {instrument.isPrimary ? <span className="ml-2 text-xs text-gold-dark">Primary</span> : null}
                    </span>
                    {instrument.proficiency ? (
                      <span className="text-muted">{labelOf(PROFICIENCIES, instrument.proficiency)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No instruments yet.</Empty>
            )}
          </Card>
        ) : null}

        {showsMusic ? (
          <Card className="p-6">
            <SectionLabel>Music</SectionLabel>
            <dl className="mt-3 space-y-3 text-sm">
              {profile.voicePart !== undefined ? (
                <Row label="Voice part" value={labelOf(VOICE_PARTS, profile.voicePart)} />
              ) : null}
              {profile.readsSheetMusic !== undefined ? (
                <Row
                  label="Reads sheet music"
                  value={profile.readsSheetMusic === null ? null : profile.readsSheetMusic ? "Yes" : "No"}
                />
              ) : null}
              {profile.learningStyle !== undefined && (isMusician || profile.learningStyle !== null) ? (
                <Row label="Plays" value={learning ? learning.label : null}>
                  {learning ? <LearningScaleDisplay value={learning.value} /> : null}
                </Row>
              ) : null}
              {profile.theoryLevel !== undefined ? (
                <Row label="Music theory" value={labelOf(THEORY_LEVELS, profile.theoryLevel)} />
              ) : null}
            </dl>
          </Card>
        ) : null}

        {profile.serviceAvailability ? (
          <Card className="p-6">
            <SectionLabel>Usually available</SectionLabel>
            {profile.serviceAvailability.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {SERVICE_AVAILABILITY.filter((slot) => profile.serviceAvailability!.includes(slot.value)).map((slot) => (
                  <li key={slot.value} className="rounded-full border border-line px-3 py-1 text-sm text-ink">
                    {slot.label}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Not given.</Empty>
            )}
            {availabilityHref ? (
              <p className="mt-4 text-sm">
                <Link
                  href={availabilityHref}
                  className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
                >
                  Change on the Availability page
                </Link>
              </p>
            ) : null}
          </Card>
        ) : null}

        {showsDetails ? (
          <Card className="p-6">
            <SectionLabel>Roles & contact</SectionLabel>
            <dl className="mt-3 space-y-3 text-sm">
              {profile.roleLabels ? <Row label="Roles" value={profile.roleLabels.join(", ") || "Member"} /> : null}
              {profile.phone !== undefined ? <Row label="Phone" value={profile.phone || null} /> : null}
            </dl>
          </Card>
        ) : null}
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
