import { afterEach, describe, expect, it, vi } from "vitest";

import { actor, john, mary, notificationStore } from "./__fixtures__/notifications";
import { users } from "./audience";
import { deliverPush, registerSubscription, removeSubscription, subscriptionStatus } from "./delivery";
import { MAX_SUBSCRIPTIONS } from "./push";
import { listNotifications, markAllRead, notify, notifySafely, openNotification, setPolicy, setPreference, unreadCount, type NotifyInput } from "./service";

const CATEGORY = "availability_changed";
const director = actor("user_director", "manage_notifications");

const send = (to: string[], extra: Partial<NotifyInput> = {}): NotifyInput => ({
  event: "system.test",
  category: CATEGORY,
  audience: users(...to),
  title: "Sunday's plan is ready",
  body: "Three hymns and a psalm.",
  actionUrl: "/song-list",
  ...extra,
});

const subscription = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  expirationTime: null,
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
});

// A failed push is logged, on purpose; the tests that cause one keep the output quiet.
afterEach(() => vi.restoreAllMocks());
const quiet = () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
};

describe("who is pushed to", () => {
  it("is decided by the category's policy and the person's choice, like every channel", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    device("user_mary");
    // Default on for both; Mary turns push off.
    await setPreference(mary, { category: CATEGORY, channel: "push", enabled: false }, deps);
    await notify(send(["user_john", "user_mary"]), deps);
    expect(sent.map((message) => message.userId)).toEqual(["user_john"]);
    // Mary still has it in the app.
    expect(await unreadCount(mary, deps)).toBe(1);
  });

  it("reaches someone with the app's switched off and push on - by push alone", async () => {
    const { deps, sent, rows, device } = notificationStore();
    device("user_john");
    await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    expect(await notify(send(["user_john"]), deps)).toMatchObject({ ok: true, recipients: 1 });

    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ id: rows[0].id, title: "Sunday's plan is ready", url: "/song-list" });
    // Not in the bell, not in the history, and not in the count - on the page or in the push.
    expect(rows[0].inApp).toBe(false);
    expect((await listNotifications(john, {}, deps)).items).toEqual([]);
    expect(await unreadCount(john, deps)).toBe(0);
    expect(sent[0].payload.unread).toBe(0);
  });

  it("leaves out someone with both switched off, and does not push where push is off", async () => {
    const { deps, sent, rows, device } = notificationStore();
    device("user_john");
    device("user_mary");
    await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    await setPreference(john, { category: CATEGORY, channel: "push", enabled: false }, deps);
    await setPreference(mary, { category: CATEGORY, channel: "push", enabled: false }, deps);
    expect(await notify(send(["user_john", "user_mary"]), deps)).toMatchObject({ ok: true, recipients: 1 });
    expect(rows.map((row) => row.recipient)).toEqual(["user_mary"]);
    expect(sent).toEqual([]);
  });

  it("cannot be switched off by the person while push is mandatory, and counts again afterwards", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    await setPreference(john, { category: CATEGORY, channel: "push", enabled: false }, deps);
    await setPolicy(director, { category: CATEGORY, channel: "push", policy: "mandatory" }, deps);
    expect(await setPreference(john, { category: CATEGORY, channel: "push", enabled: false }, deps)).toEqual({ ok: false, problem: "locked" });
    await notify(send(["user_john"]), deps);
    expect(sent).toHaveLength(1);

    await setPolicy(director, { category: CATEGORY, channel: "push", policy: "default_on" }, deps);
    await notify(send(["user_john"]), deps);
    expect(sent).toHaveLength(1);
  });

  it("is mandatory only as far as the site goes: with no device registered, nothing is sent", async () => {
    const { deps, sent, deliveries } = notificationStore();
    // Announcements start mandatory by push. John never switched push on anywhere (or his browser refused).
    expect(await notify(send(["user_john"], { category: "admin_announcement" }), deps)).toMatchObject({ ok: true, recipients: 1 });
    expect(sent).toEqual([]);
    expect(deliveries).toEqual([]);
    expect(await unreadCount(john, deps)).toBe(1);
  });

  it("is nobody while a category's push is unavailable, whatever anyone chose", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    await setPreference(john, { category: CATEGORY, channel: "push", enabled: true }, deps);
    await setPolicy(director, { category: CATEGORY, channel: "push", policy: "unavailable" }, deps);
    await notify(send(["user_john"]), deps);
    expect(sent).toEqual([]);
    expect(await unreadCount(john, deps)).toBe(1);
  });

  it("is nobody when the site has no push keys - and the notification is made all the same", async () => {
    const { deps, sent, deliveries, push, device } = notificationStore();
    device("user_john");
    push.configured = false;
    expect(await notify(send(["user_john"]), deps)).toMatchObject({ ok: true, recipients: 1 });
    expect(sent).toEqual([]);
    expect(deliveries).toEqual([]);
    expect(await unreadCount(john, deps)).toBe(1);
  });
});

describe("several devices", () => {
  it("each get the push, and each attempt is recorded", async () => {
    const { deps, sent, deliveries, rows, device } = notificationStore();
    const phone = device("user_john", "Safari on iPhone");
    const desktop = device("user_john", "Chrome on Windows");
    const laptop = device("user_john", "Edge on Windows");
    device("user_mary");
    await notify(send(["user_john"]), deps);

    expect(sent.map((message) => message.subscriptionId).sort()).toEqual([phone, desktop, laptop].sort());
    expect(deliveries).toHaveLength(3);
    expect(deliveries.map((row) => row.device).sort()).toEqual(["Chrome on Windows", "Edge on Windows", "Safari on iPhone"]);
    for (const row of deliveries) expect(row).toMatchObject({ userId: "user_john", notificationId: rows[0].id, eventId: 1, status: "sent", statusCode: 201 });
    // Never the endpoint or its keys.
    expect(JSON.stringify(deliveries)).not.toMatch(/fcm\.googleapis|p256dh|auth/);
  });

  it("carry the count as it stands after this notification", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    await notify(send(["user_john"]), deps);
    await notify(send(["user_john"]), deps);
    expect(sent.map((message) => message.payload.unread)).toEqual([1, 2]);
    await markAllRead(john, deps);
    await notify(send(["user_john"]), deps);
    expect(sent[2].payload.unread).toBe(1);
  });

  it("are not held up by one that fails, and a dead one is retired alone", async () => {
    quiet();
    const { deps, sent, deliveries, subscriptions, push, device } = notificationStore();
    const phone = device("user_john", "Safari on iPhone");
    const desktop = device("user_john", "Chrome on Windows");
    const old = device("user_john", "Chrome on Linux");
    const away = device("user_john", "Firefox on Mac");
    push.answers[old] = 410;
    push.answers[desktop] = 503;
    push.answers[away] = "throw";
    await notify(send(["user_john"]), deps);

    // Every device was tried.
    expect(sent).toHaveLength(4);
    const status = (id: number) => deliveries.find((row) => row.subscriptionId === id)!;
    expect(status(phone)).toMatchObject({ status: "sent", statusCode: 201, error: null });
    expect(status(desktop)).toMatchObject({ status: "failed", statusCode: 503 });
    expect(status(old)).toMatchObject({ status: "expired", statusCode: 410 });
    expect(status(away)).toMatchObject({ status: "failed", statusCode: null, error: "the push service is away" });

    // Only the one the push service called gone is retired; a bad moment costs nobody their device.
    expect(subscriptions.map((item) => item.id).sort()).toEqual([phone, desktop, away].sort());
    expect(subscriptions.find((item) => item.id === desktop)!.failures).toBe(1);

    // And it is never tried again.
    await notify(send(["user_john"]), deps);
    expect(sent.slice(4).map((message) => message.subscriptionId)).not.toContain(old);
  });

  it("are not retired by a refusal that may be this site's own doing", async () => {
    quiet();
    const { deps, subscriptions, push, device } = notificationStore();
    const phone = device("user_john");
    for (const answer of [401, 403, 400, 429, 500, null] as const) {
      push.answers[phone] = answer;
      await notify(send(["user_john"]), deps);
    }
    expect(subscriptions.map((item) => item.id)).toEqual([phone]);
  });

  it("switching one off leaves the others, and the person's choices, alone", async () => {
    const { deps, sent, subscriptions, device } = notificationStore();
    const phone = device("user_john", "Safari on iPhone");
    const desktop = device("user_john");
    const endpoint = subscriptions.find((item) => item.id === desktop)!.endpoint;
    expect(await removeSubscription(john, { endpoint }, deps.push)).toEqual({ ok: true, registered: false });
    await notify(send(["user_john"]), deps);
    expect(sent.map((message) => message.subscriptionId)).toEqual([phone]);
  });
});

describe("a push that fails", () => {
  it("never fails the notification, and never throws back into the action it is about", async () => {
    quiet();
    const { deps, events, push, device } = notificationStore();
    push.answers[device("user_john")] = "throw";
    await expect(notifySafely(send(["user_john"]), deps)).resolves.toBeUndefined();
    expect(events).toHaveLength(1);
    expect(await unreadCount(john, deps)).toBe(1);
  });

  it("is contained whichever part breaks: the devices, the count, the history, the hand-over", async () => {
    quiet();
    const away = async () => Promise.reject(new Error("the database is away"));
    for (const broken of ["listSubscriptions", "countUnread", "recordDeliveries", "settle", "defer"] as const) {
      const { deps, device } = notificationStore();
      device("user_john");
      const failing = { ...deps, push: { ...deps.push, [broken]: away } };
      expect(await notify(send(["user_john"]), failing), broken).toMatchObject({ ok: true, recipients: 1 });
      expect(await unreadCount(john, deps), broken).toBe(1);
    }
  });

  it("still retires a dead device when the history cannot be written", async () => {
    quiet();
    const { deps, subscriptions, push, device } = notificationStore();
    push.answers[device("user_john")] = 404;
    const failing = { ...deps.push, recordDeliveries: async () => Promise.reject(new Error("the database is away")) };
    await deliverPush([{ notificationId: 1, eventId: 1, userId: "user_john", title: "Hello", body: "", actionUrl: null, priority: "normal", tag: "n:1", folds: false }], failing);
    expect(subscriptions).toEqual([]);
  });
});

describe("folding on a device", () => {
  const change = (title: string, extra: Partial<NotifyInput> = {}): NotifyInput => ({
    event: "service_plan.updated",
    audience: users("user_john"),
    title,
    entity: { type: "service", id: "2026-10-11-am" },
    whenCoalesced: { title: "Sunday Morning song list updated", body: "Several changes were made to the published song list." },
    ...extra,
  });

  it("replaces under the tag that folds it in the app, with the folded wording", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    for (const title of ["One", "Two", "Three", "Four", "Five"]) await notify(change(title), deps);

    // Five events, five pushes - and one notification on the device, as there is one in the app.
    expect(new Set(sent.map((message) => message.payload.tag))).toEqual(new Set(["service_plan.change|service:2026-10-11-am"]));
    expect(sent.every((message) => message.collapse === "service_plan.change|service:2026-10-11-am")).toBe(true);
    expect(sent[0].payload.title).toBe("One");
    expect(sent[4].payload).toMatchObject({ title: "Sunday Morning song list updated", body: "Several changes were made to the published song list.", unread: 1 });
    expect((await listNotifications(john, {}, deps)).items).toHaveLength(1);
  });

  it("shares a tag across the events of one family, and not with another service or family", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    await notify(change("Edited"), deps);
    await notify(change("Returned to draft", { event: "service_plan.withdrawn" }), deps);
    await notify(change("Evening edited", { entity: { type: "service", id: "2026-10-11-pm" } }), deps);
    await notify(change("Cancelled", { event: "service_plan.cancelled" }), deps);
    const [edited, withdrawn, evening, cancelled] = sent.map((message) => message.payload.tag);
    expect(withdrawn).toBe(edited);
    expect(evening).not.toBe(edited);
    expect(cancelled).not.toBe(edited);
  });

  it("keeps apart what never folds: each publication is its own notification on the device", async () => {
    const { deps, sent, device } = notificationStore();
    device("user_john");
    const published = (id: string): NotifyInput => ({
      event: "service_plan.published",
      audience: users("user_john"),
      title: "New song lists published",
      entity: { type: "service_publication", id },
    });
    await notify(published("pub-1"), deps);
    await notify(published("pub-1"), deps);
    expect(sent[0].payload.tag).not.toBe(sent[1].payload.tag);
    expect(sent.map((message) => message.collapse)).toEqual([null, null]);
  });
});

describe("a tapped push", () => {
  it("marks that notification read for its owner and says where it leads", async () => {
    const { deps, rows } = notificationStore();
    await notify(send(["user_john"]), deps);
    expect(await openNotification(john, { id: rows[0].id }, deps)).toEqual({ ok: true, url: "/song-list" });
    expect(await unreadCount(john, deps)).toBe(0);
  });

  it("is not found for anyone else, who can mark nothing", async () => {
    const { deps, rows } = notificationStore();
    await notify(send(["user_john"]), deps);
    expect(await openNotification(mary, { id: rows[0].id }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await openNotification(director, { id: rows[0].id }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await openNotification(john, { id: "1" }, deps)).toEqual({ ok: false, problem: "invalid" });
    expect(await openNotification(john, { id: 999 }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await unreadCount(john, deps)).toBe(1);
  });

  it("leads where the notification leads even when it never showed in the app", async () => {
    const { deps, rows, device } = notificationStore();
    device("user_john");
    await setPreference(john, { category: CATEGORY, channel: "in_app", enabled: false }, deps);
    await notify(send(["user_john"]), deps);
    expect(await openNotification(john, { id: rows[0].id }, deps)).toEqual({ ok: true, url: "/song-list" });
  });

  it("never leads off the site, whatever was stored", async () => {
    const { deps, rows } = notificationStore();
    await notify(send(["user_john"]), deps);
    rows[0].actionUrl = "https://elsewhere.example/";
    expect(await openNotification(john, { id: rows[0].id }, deps)).toEqual({ ok: true, url: null });
  });
});

describe("whose a device is", () => {
  it("is the person signed in on it, whatever the request says", async () => {
    const { deps, subscriptions } = notificationStore();
    const input = { subscription: { ...subscription("one"), userId: "user_mary", clerk_user_id: "user_mary" }, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36", userId: "user_mary" };
    expect(await registerSubscription(john, input, deps.push)).toEqual({ ok: true, registered: true });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({ userId: "user_john", device: "Chrome on Windows" });
  });

  it("moves with the browser: the next person to sign in takes it, and the first receives nothing there", async () => {
    const { deps, subscriptions, sent } = notificationStore();
    await registerSubscription(john, { subscription: subscription("shared"), userAgent: "" }, deps.push);
    await registerSubscription(mary, { subscription: subscription("shared"), userAgent: "" }, deps.push);
    // Held once, by Mary.
    expect(subscriptions.map((item) => item.userId)).toEqual(["user_mary"]);
    await notify(send(["user_john", "user_mary"]), deps);
    expect(sent.map((message) => message.userId)).toEqual(["user_mary"]);
  });

  it("is registered once however often the same browser asks", async () => {
    const { deps, subscriptions } = notificationStore();
    for (let index = 0; index < 3; index += 1) await registerSubscription(john, { subscription: subscription("one"), userAgent: "" }, deps.push);
    expect(subscriptions).toHaveLength(1);
  });

  it("reads as not registered to anyone but its owner, who alone can remove it", async () => {
    const { deps, subscriptions } = notificationStore();
    const { endpoint } = subscription("one");
    await registerSubscription(john, { subscription: subscription("one"), userAgent: "" }, deps.push);
    expect(await subscriptionStatus(john, { endpoint }, deps.push)).toEqual({ ok: true, registered: true });
    expect(await subscriptionStatus(mary, { endpoint }, deps.push)).toEqual({ ok: true, registered: false });
    // Mary knowing the endpoint removes nothing of John's.
    expect(await removeSubscription(mary, { endpoint }, deps.push)).toEqual({ ok: true, registered: false });
    expect(subscriptions).toHaveLength(1);
    await removeSubscription(john, { endpoint }, deps.push);
    expect(subscriptions).toEqual([]);
  });

  it("refuses what is not a subscription, an address that is not a push service, and everything without push keys", async () => {
    const { deps, subscriptions, push } = notificationStore();
    expect(await registerSubscription(john, { subscription: null, userAgent: "" }, deps.push)).toEqual({ ok: false, problem: "invalid" });
    expect(await registerSubscription(john, { subscription: { ...subscription("one"), endpoint: "https://elsewhere.example/hook" }, userAgent: "" }, deps.push)).toEqual({ ok: false, problem: "invalid" });
    expect(await subscriptionStatus(john, { endpoint: "https://elsewhere.example/hook" }, deps.push)).toEqual({ ok: false, problem: "invalid" });
    expect(await removeSubscription(john, { endpoint: 7 }, deps.push)).toEqual({ ok: false, problem: "invalid" });
    push.configured = false;
    expect(await registerSubscription(john, { subscription: subscription("one"), userAgent: "" }, deps.push)).toEqual({ ok: false, problem: "not-set-up" });
    expect(subscriptions).toEqual([]);
  });

  it("keeps a person's devices to a sensible number, dropping the least recently seen", async () => {
    const { deps, subscriptions } = notificationStore();
    for (let index = 0; index <= MAX_SUBSCRIPTIONS; index += 1) {
      await registerSubscription(john, { subscription: subscription(`device-${index}`), userAgent: "" }, deps.push);
    }
    expect(subscriptions).toHaveLength(MAX_SUBSCRIPTIONS);
    expect(subscriptions.some((item) => item.endpoint.endsWith("/device-0"))).toBe(false);
    expect(subscriptions.some((item) => item.endpoint.endsWith(`/device-${MAX_SUBSCRIPTIONS}`))).toBe(true);
  });
});

describe("deleting an account", () => {
  it("takes the person's devices with it, and leaves everyone else's", async () => {
    const { deps, sent, subscriptions, deliveries, rows, device, deleteAccount } = notificationStore();
    device("user_john", "Safari on iPhone");
    device("user_john");
    const marys = device("user_mary");
    await notify(send(["user_john", "user_mary"]), deps);
    expect(deliveries).toHaveLength(3);

    deleteAccount("user_john");
    expect(subscriptions.map((item) => item.id)).toEqual([marys]);
    expect(deliveries.map((row) => row.userId)).toEqual(["user_mary"]);
    expect(rows.map((row) => row.recipient)).toEqual(["user_mary"]);

    // Nothing more can reach the devices that were theirs.
    sent.length = 0;
    await notify(send(["user_john", "user_mary"]), deps);
    expect(sent.map((message) => message.userId)).toEqual(["user_mary"]);
  });
});
