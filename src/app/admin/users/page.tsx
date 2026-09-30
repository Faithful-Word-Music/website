import Link from "next/link";

import { NoAccess, Notice } from "@/components/account/Notices";
import { Pill } from "@/components/admin/StatusPill";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { listAccounts } from "@/lib/auth/clerk";
import { formatDate } from "@/lib/auth/format";
import { MEMBER_ROLE } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { listRoles, rolesForUsers, titlesForUsers, userIdsWithRole } from "@/lib/auth/store";

export const metadata = { title: "People" };

const PAGE_SIZE = 25;

/** /admin/users - everyone with an account in this environment, searchable and filterable by role. */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const viewer = await requireAnyPermission("/admin/users", ["manage_users", "view_profiles", "manage_roles", "manage_profiles"]);
  if (!viewer) return <NoAccess />;

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const roleFilter = typeof params.role === "string" ? params.role : "";
  const page = Math.max(1, Number(params.page) || 1);

  const roles = await listRoles(viewer.env);
  const roleLabel = new Map(roles.map((role) => [role.key, role.label]));
  const filteringByRole = roleFilter !== "" && roleFilter !== MEMBER_ROLE && roleLabel.has(roleFilter);

  // Filtering by role: the role's members come from this site's database,
  // then their details from Clerk.
  const roleMembers = filteringByRole ? await userIdsWithRole(viewer.env, roleFilter) : null;
  const result =
    roleMembers && roleMembers.length === 0
      ? ({ ok: true, value: { accounts: [], total: 0 } } as const)
      : await listAccounts({
          query,
          userIds: roleMembers ?? undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });

  const accounts = result.ok ? result.value.accounts : [];
  const total = result.ok ? result.value.total : 0;
  const ids = accounts.map((account) => account.id);
  const [userRoles, userTitles] = await Promise.all([rolesForUsers(viewer.env, ids), titlesForUsers(viewer.env, ids)]);

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (roleFilter) next.set("role", roleFilter);
    if (target > 1) next.set("page", String(target));
    const text = next.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  return (
    <div>
      <SectionHeading as="h1" title="People" />

      <form method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="people-search" className="sr-only">
          Search by name or email
        </label>
        <input
          id="people-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by name or email"
          className="min-h-11 flex-1 rounded-full border border-line bg-surface px-5 text-sm text-ink placeholder:text-muted"
        />
        <label htmlFor="people-role" className="sr-only">
          Role
        </label>
        <select
          id="people-role"
          name="role"
          defaultValue={roleFilter}
          className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink"
        >
          <option value="">All roles</option>
          {roles
            .filter((role) => role.key !== MEMBER_ROLE)
            .map((role) => (
              <option key={role.key} value={role.key}>
                {role.label}
              </option>
            ))}
        </select>
        <button type="submit" className={buttonClasses("primary")}>
          Search
        </button>
      </form>

      {!result.ok ? (
        <Notice tone="warning" title="Clerk could not be reached" className="mt-6">
          The list of people cannot be shown right now. Please try again shortly.
        </Notice>
      ) : (
        <Card className="mt-6 overflow-hidden">
          {accounts.length === 0 ? (
            <p className="p-8 text-center text-muted">{query || filteringByRole ? "No one matches." : "No accounts yet."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((account) => {
                const title = userTitles.get(account.id)?.[0]?.label;
                const keys = userRoles.get(account.id) ?? [];
                return (
                  <li key={account.id}>
                    <Link
                      href={`/admin/users/${account.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted photo */}
                      <img src={account.imageUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full border border-line object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">
                          {account.fullName}
                          {title ? <span className="ml-2 text-xs font-normal text-gold-dark">{title}</span> : null}
                        </p>
                        <p className="truncate text-sm text-muted">{account.email}</p>
                      </div>
                      <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                        {account.banned ? <Pill tone="warning">Disabled</Pill> : null}
                        {keys.map((key) => (
                          <Pill key={key}>{roleLabel.get(key) ?? key}</Pill>
                        ))}
                      </div>
                      <span className="hidden w-28 shrink-0 text-right text-xs text-muted md:block">
                        {account.lastSignInAt ? `Seen ${formatDate(account.lastSignInAt)}` : "Never signed in"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {total > PAGE_SIZE ? (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClasses("secondary")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          {page * PAGE_SIZE < total ? (
            <Link href={pageHref(page + 1)} className={buttonClasses("secondary")}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
