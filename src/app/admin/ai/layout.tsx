import { AdminNav } from "@/components/admin/AdminNav";
import { aiContent } from "@/content/ai";

const nav = aiContent.admin.nav;

/**
 * Admin -> AI's own pages: usage, what the AI has been asked to remember, and
 * the planning philosophy it plans by. Presentation only - each page checks
 * use_ai for itself, and each change checks the permission it needs.
 */
export default function AiLayout({ children }: LayoutProps<"/admin/ai">) {
  return (
    <div>
      <AdminNav
        label={nav.label}
        items={[
          { href: "/admin/ai", label: nav.usage },
          { href: "/admin/ai/memory", label: nav.memory },
          { href: "/admin/ai/philosophy", label: nav.philosophy },
        ]}
      />
      <div className="mt-8">{children}</div>
    </div>
  );
}
