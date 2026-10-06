import "server-only";

import type { ClerkEnv } from "@/lib/auth/clerk-env";

import { currentPhilosophyRevision } from "./load";
import type { PhilosophyDeps } from "./service";
import { appendPhilosophyRevision, getPhilosophyRevision } from "./store";

/** The real database behind savePhilosophy() and restorePhilosophy() (service.ts), for one environment. */
export function philosophyDeps(env: ClerkEnv): PhilosophyDeps {
  return {
    current: () => currentPhilosophyRevision(env),
    get: (id) => getPhilosophyRevision(env, id),
    append: (write) => appendPhilosophyRevision(env, write),
  };
}
