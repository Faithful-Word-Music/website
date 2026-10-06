import { describe, expect, it } from "vitest";

import { NAMED, TEAM, actor, director, john, manualStore, sender } from "./__fixtures__/notifications";
import { EMPTY_SELECTION, type AudienceSelection } from "./manual";
import {
  composerOptions,
  deleteTemplate,
  duplicateTemplate,
  getAnnouncement,
  listAnnouncements,
  listTemplates,
  loadDraft,
  previewAnnouncement,
  saveTemplate,
  sendAnnouncement,
} from "./manual-service";
import { accountRequestCreated } from "./events/account";
import { listNotifications, notify, policiesFor, setPolicy, setPreference } from "./service";

const selection = (part: Partial<AudienceSelection>): AudienceSelection => ({ ...EMPTY_SELECTION, ...part });

const draft = (part: Record<string, unknown> = {}) => ({
  title: "Rehearsal moved",
  body: "Thursday at 7:00 in the choir room.",
  actionUrl: "/song-list",
  priority: "normal",
  audience: selection({ named: ["everyone"] }),
  ...part,
});

/** The small ministry, with names, and John and Mary at the piano. */
const team = () => ({
  ...TEAM,
  userRoles: { ...TEAM.userRoles },
  accountIds: [...TEAM.accountIds],
  names: { user_john: "John Smith", user_mary: "Mary Jones", user_director: "Dana Director" },
  players: { 1: ["user_john", "user_mary"], 2: ["user_john"] },
});

const told = (rows: Array<{ recipient: string }>) => rows.map((row) => row.recipient).sort();
const send = (deps: Parameters<typeof sendAnnouncement>[3], part: Record<string, unknown> = {}, who = sender) => sendAnnouncement(who, { draft: draft(part) }, NAMED, deps);

describe("who may send", () => {
  it("needs send_notifications: nothing is previewed, sent, listed or kept without it", async () => {
    const { deps, events, templates } = manualStore(team());
    await send(deps);
    for (const nobody of [john, director, actor("user_helper", "manage_users")]) {
      expect(await previewAnnouncement(nobody, draft(), NAMED, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await sendAnnouncement(nobody, { draft: draft() }, NAMED, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await composerOptions(nobody, deps)).toBeNull();
      expect(await listAnnouncements(nobody, {}, deps)).toBeNull();
      expect(await getAnnouncement(nobody, 1, deps)).toBeNull();
      expect(await listTemplates(nobody, deps)).toBeNull();
      expect(await saveTemplate(nobody, { name: "x", draft: draft() }, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await duplicateTemplate(nobody, { id: 1, rename: (name) => name }, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await deleteTemplate(nobody, 1, deps)).toEqual({ ok: false, problem: "forbidden" });
      expect(await loadDraft(nobody, { eventId: 1 }, deps)).toBeNull();
    }
    expect(events).toHaveLength(1);
    expect(templates).toEqual([]);
  });

  it("is a different permission from configuring policies, either way round", async () => {
    const { deps, notifications } = manualStore(team());
    // `director` here holds manage_notifications only; `sender` holds send_notifications only.
    expect((await send(deps, {}, sender)).ok).toBe(true);
    expect(await policiesFor(sender, notifications)).toBeNull();
    expect(await setPolicy(sender, { category: "admin_announcement", channel: "push", policy: "default_off" }, notifications)).toEqual({ ok: false, problem: "forbidden" });
    expect(await policiesFor(director, notifications)).not.toBeNull();
    expect((await send(deps, {}, director)).ok).toBe(false);
  });
});

describe("sending an announcement", () => {
  it("is one event through notify(), with a notification for each person told", async () => {
    const { deps, events, rows, notifications } = manualStore(team());
    const result = await send(deps);
    expect(result).toEqual({ ok: true, eventId: 1, recipients: TEAM.accountIds.length });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventKey: "admin.announcement",
      category: "admin_announcement",
      actorUserId: "user_director",
      entityType: "admin_announcement",
      entityId: "send-1",
      title: "Rehearsal moved",
      body: "Thursday at 7:00 in the choir room.",
      actionUrl: "/song-list",
      priority: "normal",
      coalesce: null,
    });
    expect(told(rows)).toEqual([...TEAM.accountIds].sort());
    const [item] = (await listNotifications(john, {}, notifications)).items;
    expect(item).toMatchObject({ category: "admin_announcement", title: "Rehearsal moved", actionUrl: "/song-list", readAt: null });
  });

  it("tells the sender too: they are in the audience they chose", async () => {
    const { deps, rows } = manualStore(team());
    await send(deps, { audience: selection({ named: ["planners"] }) });
    expect(told(rows)).toContain("user_director");
    await send(deps, { audience: selection({ userIds: ["user_director"] }) });
    expect(rows.filter((row) => row.recipient === "user_director")).toHaveLength(2);
  });

  it("never folds: two announcements are two notifications", async () => {
    const { deps, events, notifications } = manualStore(team());
    await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    expect(events.map((event) => event.entityId)).toEqual(["send-1", "send-2"]);
    const mine = await listNotifications(john, {}, notifications);
    expect(mine.items).toHaveLength(2);
    expect(mine.unread).toBe(2);
  });

  it("carries its priority, and leads nowhere when no link was given", async () => {
    const { deps, events, rows } = manualStore(team());
    await send(deps, { priority: "critical", actionUrl: "" });
    expect(events[0]).toMatchObject({ priority: "critical", actionUrl: null });
    expect(rows[0]).toMatchObject({ priority: "critical", actionUrl: null });
  });

  it("refuses what could not be a notification, and sends nothing", async () => {
    const { deps, events } = manualStore(team());
    expect(await send(deps, { title: "" })).toEqual({ ok: false, problem: "title" });
    expect(await send(deps, { title: "x".repeat(121) })).toEqual({ ok: false, problem: "title" });
    expect(await send(deps, { body: "" })).toEqual({ ok: false, problem: "body" });
    expect(await send(deps, { body: "x".repeat(601) })).toEqual({ ok: false, problem: "body" });
    expect(await send(deps, { priority: "urgent" })).toEqual({ ok: false, problem: "priority" });
    expect(await send(deps, { actionUrl: "https://elsewhere.example/" })).toEqual({ ok: false, problem: "link" });
    expect(await send(deps, { actionUrl: "//elsewhere.example" })).toEqual({ ok: false, problem: "link" });
    expect(await send(deps, { audience: EMPTY_SELECTION })).toEqual({ ok: false, problem: "audience" });
    expect(await send(deps, { audience: { named: ["everyone"], roles: "all" } })).toEqual({ ok: false, problem: "audience" });
    expect(await sendAnnouncement(sender, { draft: null }, NAMED, deps)).toEqual({ ok: false, problem: "title" });
    expect(events).toEqual([]);
  });

  it("refuses an audience naming a role, an instrument or a person that is not there", async () => {
    const { deps, events } = manualStore(team());
    expect(await send(deps, { audience: selection({ named: ["musicians"], roles: ["no_such_role"] }) })).toEqual({ ok: false, problem: "stale" });
    expect(await send(deps, { audience: selection({ instrumentIds: [99] }) })).toEqual({ ok: false, problem: "stale" });
    expect(await send(deps, { audience: selection({ userIds: ["user_stranger"] }) })).toEqual({ ok: false, problem: "stale" });
    expect(events).toEqual([]);
  });

  it("sends nothing, and records no send, when nobody would be told", async () => {
    const { deps, events } = manualStore({ ...team(), players: {} });
    expect(await send(deps, { audience: selection({ instrumentIds: [2] }) })).toEqual({ ok: false, problem: "nobody" });
    expect(events).toEqual([]);
  });

  it("says so when the notification could not be made, rather than pretending", async () => {
    const { deps } = manualStore(team());
    const broken = { ...deps, notifications: { ...deps.notifications, record: async () => Promise.reject(new Error("the database is away")) } };
    await expect(send(broken)).rejects.toThrow("the database is away");
    // Clerk away: the audience cannot be worked out, so nobody is guessed at.
    await expect(send({ ...deps, listPeople: async () => Promise.reject(new Error("no accounts")) })).rejects.toThrow("no accounts");
    // The category retired: refused, not thrown.
    const { deps: retired, categories } = manualStore(team());
    categories.find((category) => category.key === "admin_announcement")!.active = false;
    expect(await send(retired)).toEqual({ ok: false, problem: "unavailable" });
  });

  it("is still sent when a push fails: that is a delivery outcome", async () => {
    const { deps, device, push, deliveries } = manualStore(team());
    const phone = device("user_john");
    push.answers[phone] = 500;
    const result = await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    expect(result).toMatchObject({ ok: true, recipients: 1 });
    expect(deliveries).toMatchObject([{ userId: "user_john", status: "failed" }]);
  });

  it("asks Clerk for the accounts once, not again inside notify()", async () => {
    const { deps, calls, people } = manualStore(team());
    await send(deps);
    expect(people.calls).toBe(1);
    expect(calls.accounts).toBe(0);
  });
});

describe("the audience", () => {
  const sentTo = async (audience: AudienceSelection) => {
    const { deps, rows } = manualStore(team());
    await send(deps, { audience });
    return told(rows);
  };

  it("is everyone, including someone with no role at all", async () => {
    expect(await sentTo(selection({ named: ["everyone"] }))).toEqual([...TEAM.accountIds].sort());
  });

  it("is each named audience", async () => {
    expect(await sentTo(selection({ named: ["musicians"] }))).toEqual(["user_john"]);
    expect(await sentTo(selection({ named: ["songLeaders"] }))).toEqual(["user_mary"]);
    expect(await sentTo(selection({ named: ["administrators"] }))).toEqual(["user_admin"]);
    expect(await sentTo(selection({ named: ["musicTeam"] }))).toEqual(["user_assistant", "user_director", "user_john", "user_mary"]);
  });

  it("is a role, a person, or everyone who plays an instrument", async () => {
    expect(await sentTo(selection({ roles: ["music_director"] }))).toEqual(["user_assistant", "user_director"]);
    expect(await sentTo(selection({ userIds: ["user_member"] }))).toEqual(["user_member"]);
    expect(await sentTo(selection({ instrumentIds: [1] }))).toEqual(["user_john", "user_mary"]);
  });

  it("reaches a role an administrator made", async () => {
    const options = team();
    options.userRoles = { ...options.userRoles, user_member: ["usher"] } as typeof options.userRoles;
    const { deps, rows, roles } = manualStore(options);
    roles.push({ key: "usher", label: "Usher" });
    await send(deps, { audience: selection({ roles: ["usher"] }) });
    expect(told(rows)).toEqual(["user_member"]);
  });

  it("tells someone matching several parts once", async () => {
    // John is a musician, plays the piano and the guitar, and is named.
    const { deps, rows, events } = manualStore(team());
    const result = await send(deps, { audience: selection({ named: ["musicians", "songLeaders"], instrumentIds: [1, 2], userIds: ["user_john"] }) });
    expect(result).toMatchObject({ ok: true, recipients: 2 });
    expect(told(rows)).toEqual(["user_john", "user_mary"]);
    expect(events).toHaveLength(1);
  });

  it("leaves out an instrument's player whose account is gone", async () => {
    const { deps, rows } = manualStore({ ...team(), players: { 1: ["user_john", "user_deleted"] } });
    await send(deps, { audience: selection({ instrumentIds: [1] }) });
    expect(told(rows)).toEqual(["user_john"]);
  });
});

describe("the preview", () => {
  it("says who would be told, by name, and writes nothing", async () => {
    const { deps, events, rows } = manualStore(team());
    const result = await previewAnnouncement(sender, draft({ title: "  Rehearsal  moved ", audience: selection({ named: ["musicians"], instrumentIds: [1] }) }), NAMED, deps);
    expect(result).toEqual({
      ok: true,
      preview: {
        draft: { title: "Rehearsal moved", body: "Thursday at 7:00 in the choir room.", actionUrl: "/song-list", priority: "normal", audience: selection({ named: ["musicians"], instrumentIds: [1] }) },
        labels: { named: ["Musicians"], roles: [], instruments: ["Piano"], people: [] },
        people: [
          { id: "user_john", name: "John Smith" },
          { id: "user_mary", name: "Mary Jones" },
        ],
        push: 2,
        optedOut: 0,
      },
    });
    expect(events).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("refuses the same things a send does", async () => {
    const { deps } = manualStore(team());
    expect(await previewAnnouncement(sender, draft({ title: "" }), NAMED, deps)).toEqual({ ok: false, problem: "title" });
    expect(await previewAnnouncement(sender, draft({ actionUrl: "https://elsewhere.example/" }), NAMED, deps)).toEqual({ ok: false, problem: "link" });
    expect(await previewAnnouncement(sender, draft({ audience: selection({ roles: ["gone"] }) }), NAMED, deps)).toEqual({ ok: false, problem: "stale" });
  });

  it("is never what a send goes by: the audience is worked out again when it is sent", async () => {
    const options = team();
    const { deps, rows } = manualStore(options);
    const musicians = draft({ audience: selection({ named: ["musicians"] }) });
    const before = await previewAnnouncement(sender, musicians, NAMED, deps);
    expect(before.ok && before.preview.people.map((person) => person.id)).toEqual(["user_john"]);

    // Between looking and sending: Mary becomes a musician, John stops being one.
    options.userRoles.user_mary = ["song_leader", "musician"];
    options.userRoles.user_john = [];
    // Whatever the browser adds about who should receive it goes nowhere.
    const result = await sendAnnouncement(sender, { draft: { ...musicians, recipients: ["user_john"], people: before.ok ? before.preview.people : [] } }, NAMED, deps);
    expect(result).toMatchObject({ ok: true, recipients: 1 });
    expect(told(rows)).toEqual(["user_mary"]);
  });
});

describe("the Announcements policy", () => {
  it("decides the channels: nothing about the composer makes a push happen", async () => {
    const { deps, notifications, sent, device, rows } = manualStore(team());
    device("user_john");
    await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    expect(sent).toHaveLength(1);

    // An administrator takes push away from announcements: the next one is in the app only.
    await setPolicy(director, { category: "admin_announcement", channel: "push", policy: "unavailable" }, notifications);
    await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    expect(sent).toHaveLength(1);
    expect(rows.filter((row) => row.recipient === "user_john" && row.inApp)).toHaveLength(2);
  });

  it("lets a person opt out once it is no longer mandatory, and the preview counts them out", async () => {
    const { deps, notifications, rows } = manualStore(team());
    for (const channel of ["in_app", "push"] as const) {
      await setPolicy(director, { category: "admin_announcement", channel, policy: "default_on" }, notifications);
      await setPreference(john, { category: "admin_announcement", channel, enabled: false }, notifications);
    }
    const audience = selection({ userIds: ["user_john", "user_mary"] });
    const preview = await previewAnnouncement(sender, draft({ audience }), NAMED, deps);
    expect(preview.ok && preview.preview).toMatchObject({ people: [{ id: "user_mary" }], optedOut: 1 });
    expect(await send(deps, { audience })).toMatchObject({ ok: true, recipients: 1 });
    expect(told(rows)).toEqual(["user_mary"]);
  });

  it("pushes to every device a person registered, and to nobody's twice", async () => {
    const { deps, sent, device, deliveries } = manualStore(team());
    device("user_john", "Chrome on Windows");
    device("user_john", "Safari on iPhone");
    device("user_mary");
    await send(deps, { audience: selection({ named: ["musicians", "songLeaders"], instrumentIds: [1] }) });
    expect(sent.map((message) => message.userId).sort()).toEqual(["user_john", "user_john", "user_mary"]);
    expect(deliveries).toHaveLength(3);
    // What a device is sent has nothing of the snapshot in it.
    for (const { payload } of sent) {
      expect(Object.keys(payload).sort()).toEqual(["body", "id", "priority", "tag", "title", "unread", "url", "v"]);
      expect(JSON.stringify(payload)).not.toMatch(/senderName|labels|audience/);
    }
  });
});

describe("the history", () => {
  it("keeps exactly what was sent, to whom, and by whom", async () => {
    const { deps, events } = manualStore(team());
    await send(deps, { title: " Rehearsal  moved ", priority: "important", audience: selection({ named: ["musicians"], roles: ["song_leader"], instrumentIds: [1], userIds: ["user_director"] }) });
    expect(events[0].payload).toEqual({
      v: 1,
      title: "Rehearsal moved",
      body: "Thursday at 7:00 in the choir room.",
      actionUrl: "/song-list",
      priority: "important",
      audience: selection({ named: ["musicians"], roles: ["song_leader"], instrumentIds: [1], userIds: ["user_director"] }),
      labels: { named: ["Musicians"], roles: ["Song Leader"], instruments: ["Piano"], people: ["Dana Director"] },
      recipients: 3,
      senderName: "Dana Director",
      template: null,
    });

    const page = await listAnnouncements(sender, {}, deps);
    expect(page).toEqual({
      items: [
        {
          id: 1,
          sentAt: expect.any(String),
          senderName: "Dana Director",
          title: "Rehearsal moved",
          priority: "important",
          labels: { named: ["Musicians"], roles: ["Song Leader"], instruments: ["Piano"], people: ["Dana Director"] },
          recipients: 3,
          delivery: { sent: 0, failed: 0, expired: 0 },
        },
      ],
      nextCursor: null,
    });
  });

  it("is only announcements: no other event appears in it or can be opened through it", async () => {
    const { deps, notifications } = manualStore(team());
    await notify(accountRequestCreated({ created: true, id: 7 })!, notifications);
    await send(deps);
    const page = await listAnnouncements(sender, {}, deps);
    expect(page!.items.map((item) => item.id)).toEqual([2]);
    expect(await getAnnouncement(sender, 1, deps)).toBeNull();
    expect(await loadDraft(sender, { eventId: 1 }, deps)).toBeNull();
  });

  it("is newest first, a page at a time", async () => {
    const { deps } = manualStore(team());
    for (let index = 1; index <= 45; index += 1) await send(deps, { title: `Message ${index}`, audience: selection({ userIds: ["user_john"] }) });
    const first = await listAnnouncements(sender, {}, deps);
    expect(first!.items).toHaveLength(20);
    expect(first!.items[0].title).toBe("Message 45");
    expect(first!.nextCursor).toBe(26);
    const second = await listAnnouncements(sender, { before: first!.nextCursor }, deps);
    expect(second!.items.map((item) => item.id)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index));
    const third = await listAnnouncements(sender, { before: second!.nextCursor }, deps);
    expect(third!.items).toHaveLength(5);
    expect(third!.nextCursor).toBeNull();
    // A cursor that is not one starts from the top rather than failing.
    expect((await listAnnouncements(sender, { before: "25; DROP TABLE" }, deps))!.items[0].id).toBe(45);
  });

  it("shows one send with who was told and what became of each push", async () => {
    const { deps, device, push } = manualStore(team());
    device("user_john", "Chrome on Windows");
    const phone = device("user_john", "Safari on iPhone");
    const old = device("user_mary", "Firefox on Windows");
    push.answers[phone] = 500;
    push.answers[old] = 410;
    await send(deps, { audience: selection({ userIds: ["user_john", "user_mary", "user_director"] }) });

    const detail = await getAnnouncement(sender, 1, deps);
    expect(detail!.snapshot).toMatchObject({ title: "Rehearsal moved", recipients: 3, senderName: "Dana Director" });
    expect(detail!.people).toEqual([
      { id: "user_director", name: "Dana Director", devices: [] },
      {
        id: "user_john",
        name: "John Smith",
        devices: [
          { device: "Chrome on Windows", status: "sent" },
          { device: "Safari on iPhone", status: "failed" },
        ],
      },
      { id: "user_mary", name: "Mary Jones", devices: [{ device: "Firefox on Windows", status: "expired" }] },
    ]);
    expect(detail!.delivery).toEqual({ attempts: 3, sent: 1, failed: 1, expired: 1, reached: 1, notAttempted: 1 });
    expect((await listAnnouncements(sender, {}, deps))!.items[0].delivery).toEqual({ sent: 1, failed: 1, expired: 1 });
  });

  it("never gives out a device's address or keys", async () => {
    const { deps, device, subscriptions } = manualStore(team());
    device("user_john");
    await send(deps, { audience: selection({ userIds: ["user_john"] }) });
    const everything = JSON.stringify([await getAnnouncement(sender, 1, deps), await listAnnouncements(sender, {}, deps)]);
    const [subscription] = subscriptions;
    expect(everything).not.toContain(subscription.endpoint);
    expect(everything).not.toContain(subscription.p256dh);
    expect(everything).not.toContain(subscription.auth);
    expect(everything).not.toMatch(/endpoint|p256dh|"auth"|fcm\.googleapis/);
  });

  it("still reads when names cannot be looked up, or the sender's account is gone", async () => {
    const options = team();
    const { deps } = manualStore(options);
    await send(deps, { audience: selection({ userIds: ["user_john", "user_director"] }) });
    // The sender's account is deleted afterwards.
    options.accountIds = options.accountIds.filter((id) => id !== "user_director");
    const detail = await getAnnouncement(sender, 1, deps);
    expect(detail!.snapshot.senderName).toBe("Dana Director");
    expect(detail!.people.find((person) => person.id === "user_director")!.name).toBeNull();

    const away = await getAnnouncement(sender, 1, { ...deps, listPeople: async () => Promise.reject(new Error("no accounts")) });
    expect(away!.people.map((person) => person.name)).toEqual([null, null]);
    expect(away!.snapshot.title).toBe("Rehearsal moved");
  });

  it("keeps none of it where an ordinary person's notifications are read", async () => {
    const { deps, notifications } = manualStore(team());
    await send(deps);
    const [item] = (await listNotifications(john, {}, notifications)).items;
    expect(Object.keys(item).sort()).toEqual(["actionUrl", "body", "category", "createdAt", "id", "priority", "readAt", "title"]);
    expect(JSON.stringify(item)).not.toMatch(/senderName|Dana|labels|recipients/);
  });
});

describe("templates", () => {
  const kept = { title: "Rehearsal moved", body: "Thursday at 7:00 in the choir room.", actionUrl: "/song-list", priority: "normal", audience: selection({ named: ["everyone"] }) };

  it("are created, listed by name, edited, duplicated and deleted", async () => {
    const { deps } = manualStore(team());
    expect(await saveTemplate(sender, { name: "  Rehearsal   change ", draft: draft() }, deps)).toEqual({ ok: true, id: 1 });
    expect(await saveTemplate(sender, { name: "Cancelled service", draft: draft({ title: "Service cancelled", body: "", audience: EMPTY_SELECTION }) }, deps)).toEqual({ ok: true, id: 2 });
    expect((await listTemplates(sender, deps))!.map((template) => template.name)).toEqual(["Cancelled service", "Rehearsal change"]);
    expect((await listTemplates(sender, deps))![1]).toMatchObject({ id: 1, draft: kept, createdBy: "user_director", updatedBy: "user_director" });

    const assistant = actor("user_assistant", "send_notifications");
    expect(await saveTemplate(assistant, { id: 1, name: "Rehearsal change", draft: draft({ title: "Rehearsal moved again", priority: "important" }) }, deps)).toEqual({ ok: true, id: 1 });
    const edited = (await listTemplates(sender, deps))!.find((template) => template.id === 1)!;
    expect(edited).toMatchObject({ draft: { title: "Rehearsal moved again", priority: "important" }, createdBy: "user_director", updatedBy: "user_assistant" });

    expect(await duplicateTemplate(sender, { id: 1, rename: (name) => `Copy of ${name}` }, deps)).toEqual({ ok: true, id: 3 });
    const copy = (await listTemplates(sender, deps))!.find((template) => template.id === 3)!;
    expect(copy).toMatchObject({ name: "Copy of Rehearsal change", draft: edited.draft });

    expect(await deleteTemplate(sender, 1, deps)).toEqual({ ok: true });
    expect(await deleteTemplate(sender, 1, deps)).toEqual({ ok: false, problem: "not-found" });
    expect((await listTemplates(sender, deps))!.map((template) => template.id).sort()).toEqual([2, 3]);
  });

  it("refuse a missing name, a bad draft, and a template that is not there", async () => {
    const { deps, templates } = manualStore(team());
    expect(await saveTemplate(sender, { name: " ", draft: draft() }, deps)).toEqual({ ok: false, problem: "name" });
    expect(await saveTemplate(sender, { name: "x".repeat(81), draft: draft() }, deps)).toEqual({ ok: false, problem: "name" });
    expect(await saveTemplate(sender, { name: "x", draft: draft({ title: "" }) }, deps)).toEqual({ ok: false, problem: "title" });
    expect(await saveTemplate(sender, { name: "x", draft: draft({ actionUrl: "https://elsewhere.example/" }) }, deps)).toEqual({ ok: false, problem: "link" });
    expect(await saveTemplate(sender, { name: "x", draft: draft({ priority: "urgent" }) }, deps)).toEqual({ ok: false, problem: "priority" });
    expect(await saveTemplate(sender, { name: "x", draft: draft({ audience: { named: ["nobody"] } }) }, deps)).toEqual({ ok: false, problem: "audience" });
    expect(await saveTemplate(sender, { id: 9, name: "x", draft: draft() }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await saveTemplate(sender, { id: "1", name: "x", draft: draft() }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(await duplicateTemplate(sender, { id: 9, rename: (name) => name }, deps)).toEqual({ ok: false, problem: "not-found" });
    expect(templates).toEqual([]);
  });

  it("are not needed to send, and sending never makes one", async () => {
    const { deps, templates, events } = manualStore(team());
    expect((await send(deps)).ok).toBe(true);
    expect(templates).toEqual([]);
    expect(events[0].payload).toMatchObject({ template: null });
  });

  it("load into the composer as a copy: what is sent from it leaves the template as it was", async () => {
    const { deps, templates, events } = manualStore(team());
    await saveTemplate(sender, { name: "Rehearsal change", draft: draft() }, deps);
    const loaded = await loadDraft(sender, { templateId: 1 }, deps);
    expect(loaded).toEqual({ draft: kept, template: { id: 1, name: "Rehearsal change" }, dropped: false });

    // The person changes the loaded draft and sends it.
    const changed = { ...loaded!.draft, title: "Rehearsal moved to Friday", audience: selection({ userIds: ["user_john"] }) };
    expect(await sendAnnouncement(sender, { draft: changed, templateId: 1 }, NAMED, deps)).toMatchObject({ ok: true, recipients: 1 });
    expect(templates[0].draft).toEqual(kept);
    expect(events[0].payload).toMatchObject({ title: "Rehearsal moved to Friday", template: { id: 1, name: "Rehearsal change" } });
  });

  it("can be edited or deleted without changing anything already sent", async () => {
    const { deps } = manualStore(team());
    await saveTemplate(sender, { name: "Rehearsal change", draft: draft() }, deps);
    await sendAnnouncement(sender, { draft: draft(), templateId: 1 }, NAMED, deps);

    await saveTemplate(sender, { id: 1, name: "Renamed", draft: draft({ title: "Something else entirely", body: "New words." }) }, deps);
    let detail = await getAnnouncement(sender, 1, deps);
    expect(detail!.snapshot).toMatchObject({ title: "Rehearsal moved", body: "Thursday at 7:00 in the choir room.", template: { id: 1, name: "Rehearsal change" } });

    await deleteTemplate(sender, 1, deps);
    detail = await getAnnouncement(sender, 1, deps);
    expect(detail!.snapshot).toMatchObject({ title: "Rehearsal moved", template: { id: 1, name: "Rehearsal change" } });
    expect((await listAnnouncements(sender, {}, deps))!.items).toHaveLength(1);
    // A send naming a template that is gone is still sent, with no template recorded.
    expect(await sendAnnouncement(sender, { draft: draft(), templateId: 1 }, NAMED, deps)).toMatchObject({ ok: true });
    expect((await getAnnouncement(sender, 2, deps))!.snapshot.template).toBeNull();
  });

  it("stop at a hundred", async () => {
    const { deps } = manualStore(team());
    for (let index = 0; index < 100; index += 1) await saveTemplate(sender, { name: `Template ${index}`, draft: draft() }, deps);
    expect(await saveTemplate(sender, { name: "One more", draft: draft() }, deps)).toEqual({ ok: false, problem: "too-many" });
    expect(await duplicateTemplate(sender, { id: 1, rename: (name) => name }, deps)).toEqual({ ok: false, problem: "too-many" });
    // Editing one that exists is still allowed.
    expect((await saveTemplate(sender, { id: 1, name: "Edited", draft: draft() }, deps)).ok).toBe(true);
  });
});

describe("use again", () => {
  it("opens an old send as a draft: nothing is sent, changed or made into a template", async () => {
    const { deps, events, templates } = manualStore(team());
    const audience = selection({ named: ["musicians"], instrumentIds: [1] });
    await send(deps, { priority: "important", audience });
    const before = JSON.stringify(events);

    const loaded = await loadDraft(sender, { eventId: 1 }, deps);
    expect(loaded).toEqual({
      draft: { title: "Rehearsal moved", body: "Thursday at 7:00 in the choir room.", actionUrl: "/song-list", priority: "important", audience },
      template: null,
      dropped: false,
    });
    expect(JSON.stringify(events)).toBe(before);
    expect(templates).toEqual([]);

    // Sent again, it is a second send; the first is as it was.
    await sendAnnouncement(sender, { draft: { ...loaded!.draft, title: "Rehearsal moved (reminder)" } }, NAMED, deps);
    expect(events).toHaveLength(2);
    expect((await getAnnouncement(sender, 1, deps))!.snapshot.title).toBe("Rehearsal moved");
  });

  it("leaves out whatever of the old audience is gone, and says so", async () => {
    const options = team();
    const { deps, roles } = manualStore(options);
    roles.push({ key: "usher", label: "Usher" });
    await send(deps, { audience: selection({ named: ["musicians"], roles: ["usher"], userIds: ["user_mary"] }) });
    roles.pop();
    options.accountIds = options.accountIds.filter((id) => id !== "user_mary");

    const loaded = await loadDraft(sender, { eventId: 1 }, deps);
    expect(loaded!.draft.audience).toEqual(selection({ named: ["musicians"] }));
    expect(loaded!.dropped).toBe(true);
    // The record of what WAS sent still names them.
    expect((await getAnnouncement(sender, 1, deps))!.snapshot.labels).toEqual({ named: ["Musicians"], roles: ["Usher"], instruments: [], people: ["Mary Jones"] });
  });

  it("is nothing for a send or a template that is not there", async () => {
    const { deps } = manualStore(team());
    expect(await loadDraft(sender, { eventId: 5 }, deps)).toBeNull();
    expect(await loadDraft(sender, { templateId: 5 }, deps)).toBeNull();
    expect(await loadDraft(sender, { eventId: "1" }, deps)).toBeNull();
  });
});
