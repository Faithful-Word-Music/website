import { describe, expect, it } from "vitest";

import { NOTIFICATION_LIMITS } from "./model";
import {
  PUSH_FALLBACK_URL,
  appBadge,
  buildPushPayload,
  classifyPushResult,
  deviceLabel,
  isVapidPublicKey,
  parseEndpoint,
  parsePushClick,
  parsePushPayload,
  parseSubscription,
  pushDeviceState,
  pushOpenPath,
  pushTag,
  pushUrgency,
  vapidKeyBytes,
  type PushEnvironment,
  type PushMessage,
} from "./push";

const message = (extra: Partial<PushMessage> = {}): PushMessage => ({
  notificationId: 41,
  eventId: 7,
  userId: "user_john",
  title: "Sunday Morning song list updated",
  body: "Sunday, October 11: Psalm 120 was removed.",
  actionUrl: "/song-list",
  priority: "normal",
  tag: "n:41",
  folds: false,
  ...extra,
});

describe("what a device is sent", () => {
  it("is what to show, where it leads, what it replaces and the count - and nothing else", () => {
    const payload = buildPushPayload(message(), 3);
    expect(payload).toEqual({
      v: 1,
      id: 41,
      title: "Sunday Morning song list updated",
      body: "Sunday, October 11: Psalm 120 was removed.",
      url: "/song-list",
      tag: "n:41",
      unread: 3,
      priority: "normal",
    });
    // Whose it is, and the event behind it, stay on the server.
    expect(JSON.stringify(payload)).not.toMatch(/user_john|eventId|userId/);
    expect(parsePushPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it("leads to the notifications page when it has no page of its own, and never off the site", () => {
    expect(buildPushPayload(message({ actionUrl: null }), 0).url).toBe(PUSH_FALLBACK_URL);
    for (const elsewhere of ["https://elsewhere.example/", "//elsewhere.example", "/\\elsewhere.example", "javascript:alert(1)"]) {
      expect(buildPushPayload(message({ actionUrl: elsewhere }), 0).url).toBe(PUSH_FALLBACK_URL);
    }
  });

  it("never carries a count that is not a count", () => {
    expect(buildPushPayload(message(), -2).unread).toBe(0);
    expect(buildPushPayload(message(), Number.NaN).unread).toBe(0);
    expect(buildPushPayload(message(), 4.9).unread).toBe(4);
  });

  it("is refused by a device when it is anything else", () => {
    const good = buildPushPayload(message(), 1);
    expect(parsePushPayload(null)).toBeNull();
    expect(parsePushPayload("hello")).toBeNull();
    expect(parsePushPayload({ ...good, v: 2 })).toBeNull();
    expect(parsePushPayload({ ...good, id: "41" })).toBeNull();
    expect(parsePushPayload({ ...good, id: 0 })).toBeNull();
    expect(parsePushPayload({ ...good, title: "" })).toBeNull();
    expect(parsePushPayload({ ...good, title: "x".repeat(NOTIFICATION_LIMITS.titleChars + 1) })).toBeNull();
    expect(parsePushPayload({ ...good, body: 7 })).toBeNull();
    expect(parsePushPayload({ ...good, tag: "" })).toBeNull();
    for (const url of ["https://elsewhere.example/", "//elsewhere.example", "javascript:alert(1)", "", 7]) {
      expect(parsePushPayload({ ...good, url })).toBeNull();
    }
    // An unknown priority is only a priority: it reads as normal.
    expect(parsePushPayload({ ...good, priority: "shouting" })?.priority).toBe("normal");
  });

  it("wakes a device at once only for what matters", () => {
    expect(pushUrgency("normal")).toBe("normal");
    expect(pushUrgency("important")).toBe("high");
    expect(pushUrgency("critical")).toBe("high");
  });
});

describe("a tapped push", () => {
  it("opens through the page that marks it read", () => {
    expect(pushOpenPath(41)).toBe("/notifications/open/41");
  });

  it("is followed by an open page only to a page on this site", () => {
    expect(parsePushClick({ type: "fwm:push-click", id: 41, url: "/song-list" })).toEqual({ id: 41, url: "/song-list" });
    expect(parsePushClick({ id: 41, url: "https://elsewhere.example/" })).toEqual({ id: 41, url: PUSH_FALLBACK_URL });
    expect(parsePushClick({ id: "41", url: "//elsewhere.example" })).toEqual({ id: null, url: PUSH_FALLBACK_URL });
    expect(parsePushClick({ id: -1 })).toEqual({ id: null, url: PUSH_FALLBACK_URL });
    expect(parsePushClick("fwm:push-click")).toBeNull();
  });
});

describe("the tag a device files a push under", () => {
  const service = { type: "service", id: "2026-10-11-am" };

  it("is the family and entity of an event that folds, so the device replaces as the app does", () => {
    const first = pushTag({ family: "service_plan.change" }, service, 1);
    const second = pushTag({ family: "service_plan.change" }, service, 2);
    expect(first).toEqual({ tag: "service_plan.change|service:2026-10-11-am", folds: true });
    expect(second.tag).toBe(first.tag);
  });

  it("differs for another entity and for another family", () => {
    const base = pushTag({ family: "service_plan.change" }, service, 1).tag;
    expect(pushTag({ family: "service_plan.change" }, { type: "service", id: "2026-10-11-pm" }, 1).tag).not.toBe(base);
    expect(pushTag({ family: "service_plan.status" }, service, 1).tag).not.toBe(base);
  });

  it("is the notification's own for an event that never folds, or says nothing of what it is about", () => {
    expect(pushTag(null, service, 5)).toEqual({ tag: "n:5", folds: false });
    expect(pushTag({ family: "service_plan.change" }, null, 6)).toEqual({ tag: "n:6", folds: false });
    expect(pushTag(undefined, undefined, 7).tag).not.toBe(pushTag(undefined, undefined, 8).tag);
  });
});

describe("the app icon's count", () => {
  it("is the unread count, and nothing at all at zero", () => {
    expect(appBadge(3)).toEqual({ set: 3 });
    expect(appBadge(250)).toEqual({ set: 250 });
    expect(appBadge(0)).toEqual({ clear: true });
    expect(appBadge(-1)).toEqual({ clear: true });
    expect(appBadge(Number.NaN)).toEqual({ clear: true });
    expect(appBadge(2.7)).toEqual({ set: 2 });
  });
});

describe("a browser's subscription", () => {
  const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

  it("is its endpoint and two keys, and nothing about whose it is", () => {
    expect(parseSubscription({ endpoint, expirationTime: null, keys, userId: "user_mary" })).toEqual({ endpoint, ...keys });
  });

  it("is accepted from the browsers' own push services", () => {
    for (const known of [
      endpoint,
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-by3p.notify.windows.com/w/?token=abc",
    ]) {
      expect(parseEndpoint(known), known).toBe(known);
    }
  });

  it("is refused anywhere the server should not be made to call", () => {
    for (const elsewhere of [
      "https://elsewhere.example/push",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.elsewhere.example/abc",
      "https://notfcm.googleapis.com.example/abc",
      "https://user:secret@fcm.googleapis.com/abc",
      "https://fcm.googleapis.com:8443/abc",
      "https://localhost/abc",
      "https://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
      "",
      7,
      `https://fcm.googleapis.com/${"x".repeat(3000)}`,
    ]) {
      expect(parseEndpoint(elsewhere), String(elsewhere).slice(0, 60)).toBeNull();
    }
  });

  it("is refused without both keys, or with keys that could not be keys", () => {
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ endpoint })).toBeNull();
    expect(parseSubscription({ endpoint, keys: { p256dh: keys.p256dh } })).toBeNull();
    expect(parseSubscription({ endpoint, keys: { ...keys, auth: "short" } })).toBeNull();
    expect(parseSubscription({ endpoint, keys: { ...keys, p256dh: "not a key!".repeat(9) } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://elsewhere.example/", keys })).toBeNull();
  });
});

describe("what a push service's answer means", () => {
  it("is sent when accepted", () => {
    expect(classifyPushResult(201)).toBe("sent");
    expect(classifyPushResult(200)).toBe("sent");
  });

  it("is expired only when the service says the subscription is gone", () => {
    expect(classifyPushResult(404)).toBe("expired");
    expect(classifyPushResult(410)).toBe("expired");
  });

  it("is otherwise a failure the subscription survives", () => {
    for (const status of [null, 400, 401, 403, 413, 429, 500, 502, 503]) expect(classifyPushResult(status), String(status)).toBe("failed");
  });
});

describe("a device's name in the delivery history", () => {
  it("is its browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0")).toBe("Firefox on Mac");
  });

  it("is never empty", () => {
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("curl/8.0")).toBe("Unknown device");
  });
});

describe("push on this device", () => {
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";

  /** Push switched on here by the person signed in, and working. */
  const on: PushEnvironment = {
    configured: true,
    userAgent: CHROME,
    maxTouchPoints: 0,
    standalone: false,
    supported: true,
    permission: "granted",
    subscribed: true,
    keyMatches: true,
    mine: true,
    registered: true,
  };
  const state = (extra: Partial<PushEnvironment>) => pushDeviceState({ ...on, ...extra });

  it("is enabled only with permission, a live subscription, and the server's word that it is this person's", () => {
    expect(pushDeviceState(on)).toBe("enabled");
  });

  it("is off until the person switches it on - permission alone is not on", () => {
    expect(state({ permission: "default", subscribed: false, mine: false, registered: false })).toBe("off");
    // Someone else allowed notifications in this browser: this person has not switched push on.
    expect(state({ mine: false, registered: false })).toBe("off");
    expect(state({ mine: false, subscribed: false, registered: false })).toBe("off");
  });

  it("is denied when the browser or device blocks it, whatever the site holds", () => {
    expect(state({ permission: "denied" })).toBe("denied");
    expect(state({ permission: "denied", subscribed: false, registered: false, mine: false })).toBe("denied");
  });

  it("needs reconnecting when this person's device has lost its connection", () => {
    expect(state({ registered: false })).toBe("needs-repair");
    expect(state({ keyMatches: false })).toBe("needs-repair");
    // Signed out and back in: the browser's subscription was ended.
    expect(state({ subscribed: false, registered: false })).toBe("needs-repair");
  });

  it("says an iPhone or iPad needs the installed app, rather than offering a button that cannot work", () => {
    expect(state({ userAgent: IPHONE, supported: false, permission: "default", subscribed: false, mine: false, registered: false })).toBe("needs-install");
    expect(state({ userAgent: IPAD, maxTouchPoints: 5, supported: false, permission: "default" })).toBe("needs-install");
    // Inside the Home Screen app it is an ordinary device.
    expect(state({ userAgent: IPHONE, standalone: true, permission: "default", subscribed: false, mine: false, registered: false })).toBe("off");
    expect(state({ userAgent: IPHONE, standalone: true })).toBe("enabled");
    // An iPhone too old for push, even installed.
    expect(state({ userAgent: IPHONE, standalone: true, supported: false })).toBe("unsupported");
  });

  it("is unsupported where the browser cannot do push, and not set up without the site's key", () => {
    expect(state({ supported: false })).toBe("unsupported");
    expect(state({ configured: false })).toBe("not-set-up");
    expect(state({ configured: false, userAgent: IPHONE })).toBe("not-set-up");
  });
});

describe("the site's public push key", () => {
  // A real P-256 public key: 65 bytes, the first of them 4.
  const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

  it("becomes the bytes a browser subscribes with", () => {
    const bytes = vapidKeyBytes(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("is recognised by its shape", () => {
    expect(isVapidPublicKey(KEY)).toBe(true);
    expect(isVapidPublicKey("")).toBe(false);
    expect(isVapidPublicKey("your_vapid_public_key_here")).toBe(false);
    expect(isVapidPublicKey(undefined)).toBe(false);
  });
});
