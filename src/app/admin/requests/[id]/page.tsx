import Link from "next/link";
import { notFound } from "next/navigation";

import { NoAccess } from "@/components/account/Notices";
import { SectionLabel } from "@/components/account/ProfileView";
import { RequestReview } from "@/components/admin/RequestReview";
import { StatusPill } from "@/components/admin/StatusPill";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getAccount } from "@/lib/auth/clerk";
import { formatDateTime } from "@/lib/auth/format";
import { reconcileRequests } from "@/lib/auth/reconcile";
import { requireAnyPermission } from "@/lib/auth/session";
import { getRequest } from "@/lib/auth/store";

export const metadata = { title: "Account request" };

/** /admin/requests/[id] - one request, where it is approved or declined. The review email links here. */
export default async function RequestPage({ params }: PageProps<"/admin/requests/[id]">) {
  const { id } = await params;
  const viewer = await requireAnyPermission(`/admin/requests/${id}`, ["manage_users"]);
  if (!viewer) return <NoAccess />;

  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();
  const stored = await getRequest(viewer.env, requestId);
  if (!stored) notFound();
  const [request] = await reconcileRequests(viewer.env, [stored]);

  const reviewer = request.reviewedBy ? await getAccount(request.reviewedBy) : null;
  const reviewerName = reviewer?.ok ? reviewer.value.fullName : request.reviewedBy ? "A former administrator" : null;

  return (
    <div className="max-w-3xl">
      <p className="text-sm">
        <Link href="/admin/requests" className="text-muted transition-colors hover:text-ink">
          ← All requests
        </Link>
      </p>
      <SectionHeading as="h1" title={request.name} className="mt-4">
        <p className="text-base">{request.email}</p>
      </SectionHeading>

      <Card className="mt-8 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <SectionLabel>Message</SectionLabel>
          <StatusPill status={request.status} />
        </div>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-ink">
          {request.message || <span className="text-muted">No message.</span>}
        </p>

        <dl className="mt-6 grid gap-4 border-t border-line pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Requested</dt>
            <dd className="text-ink">{formatDateTime(request.createdAt)}</dd>
          </div>
          {reviewerName ? (
            <div>
              <dt className="text-muted">Reviewed</dt>
              <dd className="text-ink">
                {reviewerName}, {formatDateTime(request.reviewedAt)}
              </dd>
            </div>
          ) : null}
          {request.reviewNote ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Note</dt>
              <dd className="whitespace-pre-line text-ink">{request.reviewNote}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <div className="mt-6">
        {request.status === "pending" ? (
          <RequestReview requestId={request.id} email={request.email} />
        ) : request.status === "invited" ? (
          <p className="text-sm text-muted">
            An invitation has been sent and is waiting to be accepted. It can be withdrawn from{" "}
            <Link href="/admin/invitations" className="text-ink underline decoration-gold underline-offset-4">
              Invitations
            </Link>
            .
          </p>
        ) : request.status === "revoked" || request.status === "expired" ? (
          <p className="text-sm text-muted">
            The invitation was not used. To try again, send a new one from{" "}
            <Link href="/admin/invitations" className="text-ink underline decoration-gold underline-offset-4">
              Invitations
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
