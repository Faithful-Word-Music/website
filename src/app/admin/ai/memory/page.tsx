import { NoAccess, Notice } from "@/components/account/Notices";
import { MemoryManager } from "@/components/admin/MemoryManager";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { aiContent } from "@/content/ai";
import { canManageGlobalMemory, canUsePersonalMemory, listMemories } from "@/lib/ai/memory/service";
import { memoryDeps } from "@/lib/ai/memory/store";
import { namesOf } from "@/lib/ai/people";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata = { title: "AI memory" };

const content = aiContent.admin.memory;

/**
 * /admin/ai/memory - what the AI has been asked to remember: the person's own
 * memories and the ministry's global ones (use_ai to see the page).
 *
 * What is listed is what listMemories() gives THIS person: the global
 * memories, and their own personal ones if they hold use_personal_ai_memory.
 * Nobody else's personal memory is ever read here. Changing a global memory
 * needs manage_global_ai_memory - the buttons follow that, and every action
 * checks it again (src/lib/ai/memory/service.ts).
 */
export default async function MemoryPage() {
  const viewer = await requireAnyPermission("/admin/ai/memory", ["use_ai"]);
  if (!viewer) return <NoAccess />;

  let memory;
  try {
    memory = await listMemories(viewer, memoryDeps(viewer.env));
  } catch (error) {
    console.error("[ai] Could not load memory:", error instanceof Error ? error.message : "unknown error");
    memory = null;
  }

  // Who saved and last changed each global memory. A personal one is always the person's own.
  const names = memory ? await namesOf(memory.global.flatMap((item) => [item.createdBy, item.updatedBy])) : new Map<string, string>();

  return (
    <div>
      <SectionHeading as="h1" title={content.title}>
        <p className="text-base">{content.intro}</p>
      </SectionHeading>

      {memory ? (
        <MemoryManager
          personal={memory.personal}
          global={memory.global}
          canPersonal={canUsePersonalMemory(viewer)}
          canGlobal={canManageGlobalMemory(viewer)}
          names={Object.fromEntries(names)}
        />
      ) : (
        <Notice tone="warning" title={content.unavailable.title} className="mt-8">
          {content.unavailable.body}
        </Notice>
      )}
    </div>
  );
}
