import { NextResponse } from "next/server";

import { conductorContent } from "@/content/conductor";
import { conductorHeaders, conductorRefusal, conductorRoute, conductorViewer } from "@/lib/ai/conductor/request";
import { isConversationId, normalizeTitle } from "@/lib/ai/conversations/model";
import { deleteConversation, getConversation, listMessages, renameConversation } from "@/lib/ai/conversations/store";

const notFound = () => conductorRefusal(404, conductorContent.errors.notFound);

/**
 * /api/conductor/conversations/[id] - one saved conversation of the person
 * asking: open it (GET), rename it (PATCH { title }) or delete it (DELETE).
 *
 * Every one of these looks the conversation up as THIS person's. An id that
 * belongs to someone else, or to nobody, is a 404 either way.
 */
export async function GET(_request: Request, context: RouteContext<"/api/conductor/conversations/[id]">) {
  const asking = await conductorViewer();
  if ("refused" in asking) return asking.refused;
  const { viewer } = asking;
  const { id } = await context.params;
  if (!isConversationId(id)) return notFound();

  return conductorRoute(async () => {
    const conversation = await getConversation(viewer.env, viewer.userId, id);
    if (!conversation) return notFound();
    const messages = await listMessages(viewer.env, viewer.userId, id);
    return NextResponse.json(
      {
        // Its summary is the model's own working note, not something to show.
        conversation: { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, lastMessageAt: conversation.lastMessageAt },
        messages,
      },
      { headers: conductorHeaders },
    );
  });
}

export async function PATCH(request: Request, context: RouteContext<"/api/conductor/conversations/[id]">) {
  const asking = await conductorViewer();
  if ("refused" in asking) return asking.refused;
  const { viewer } = asking;
  const { id } = await context.params;
  if (!isConversationId(id)) return notFound();

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title = normalizeTitle(body?.title);
  if (!title) return conductorRefusal(400, conductorContent.history.errors.title);

  return conductorRoute(async () =>
    (await renameConversation(viewer.env, viewer.userId, id, title)) ? NextResponse.json({ title }, { headers: conductorHeaders }) : notFound(),
  );
}

export async function DELETE(_request: Request, context: RouteContext<"/api/conductor/conversations/[id]">) {
  const asking = await conductorViewer();
  if ("refused" in asking) return asking.refused;
  const { viewer } = asking;
  const { id } = await context.params;
  if (!isConversationId(id)) return notFound();

  return conductorRoute(async () =>
    (await deleteConversation(viewer.env, viewer.userId, id)) ? NextResponse.json({ deleted: true }, { headers: conductorHeaders }) : notFound(),
  );
}
