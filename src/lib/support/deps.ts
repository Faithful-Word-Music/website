import "server-only";

import { randomBytes } from "node:crypto";

import type { ClerkEnv } from "@/lib/auth/clerk-env";
import { resolvePermissions } from "@/lib/auth/permissions";
import { loadAuthorization } from "@/lib/auth/store";

import { MANAGE_PERMISSION } from "./access";
import { resolveContext } from "./context-load";
import { newPublicId } from "./model";
import { tellSupportSoon } from "./notify";
import type { SupportDeps } from "./service";
import * as store from "./store";

/** The database, the context checks and the notifications behind service.ts, for one environment. */
export function supportDeps(env: ClerkEnv): SupportDeps {
  return {
    insertRequest: (write) => store.insertRequest(env, write, () => newPublicId((bytes) => randomBytes(bytes))),
    getRequest: (publicId) => store.getRequest(env, publicId),
    listMessages: (requestId, includeInternal) => store.listMessages(env, requestId, includeInternal),
    listEvents: (requestId, includeInternal) => store.listEvents(env, requestId, includeInternal),
    appendReply: (write) => store.appendReply(env, write),
    saveWorkflow: (write) => store.saveWorkflow(env, write),
    listRequests: (filter) => store.listRequests(env, filter),
    async isManager(userId) {
      const { roleKeys, rolePermissions, overrides } = await loadAuthorization(env, userId);
      return resolvePermissions(roleKeys, rolePermissions, overrides).has(MANAGE_PERMISSION);
    },
    resolveContext: (actor, category, input) => resolveContext(env, actor, category, input),
    tell: (eventIds) => tellSupportSoon(env, eventIds),
  };
}
