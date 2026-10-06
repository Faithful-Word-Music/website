/*
 * The Faithful Word Music service worker: push notifications, and nothing else.
 *
 *   push                a message from the site's server (src/lib/notifications/
 *                       delivery.ts) -> show it, set the app icon's count, and
 *                       tell any open page to refresh its notifications
 *   notificationclick   -> close it, bring the site forward (or open it) at
 *                       the page the notification is about, and have it
 *                       marked read
 *
 * There is deliberately NO fetch handler and NO cache here: this worker never
 * touches a page load. Offline use is a separate, later piece of work.
 *
 * It cannot import the site's code, so the checks on a message are written
 * out here; they are the same as parsePushPayload in src/lib/notifications/
 * push.ts, and src/lib/notifications/sw.test.ts runs this very file.
 *
 * A plain script, written for every browser that can do push: it is served
 * as it is, with no build step.
 */
"use strict";

var FALLBACK_URL = "/notifications";
var ICON = "/app-icon/192";
/** How long an open page has to say it took a tap before the site is opened afresh instead. */
var ACK_MS = 1500;

/** A page on this site: one leading slash, nothing that could lead elsewhere. (isSitePath, src/lib/page-origin.ts) */
function isSitePath(value) {
  return typeof value === "string" && value.length <= 500 && /^\/(?![/\\])/.test(value) && !/[\s\u0000-\u001f]/.test(value);
}

function isId(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value > 0;
}

/** What the server sent, checked - or null, and the fallback below is shown instead. */
function readPayload(data) {
  if (!data || typeof data !== "object" || data.v !== 1) return null;
  if (!isId(data.id)) return null;
  if (typeof data.title !== "string" || data.title === "" || data.title.length > 120) return null;
  if (typeof data.body !== "string" || data.body.length > 600) return null;
  if (!isSitePath(data.url)) return null;
  if (typeof data.tag !== "string" || data.tag === "") return null;
  if (typeof data.unread !== "number" || !isFinite(data.unread)) return null;
  return { id: data.id, title: data.title, body: data.body, url: data.url, tag: data.tag, unread: Math.max(0, Math.floor(data.unread)) };
}

/**
 * Every push must show something: a browser that receives a push and is shown
 * nothing takes the permission away (Safari at once, Chrome before long).
 * So a message that cannot be read still says there is news, and leads to the
 * notifications page, where the real one is.
 */
var FALLBACK = { id: null, title: "Faithful Word Music", body: "You have a new notification.", url: FALLBACK_URL, tag: "fwm:notification", unread: null };

/** The installed app's icon: the unread count, or nothing at zero. Does nothing where icons cannot be badged. */
function setBadge(unread) {
  try {
    var nav = self.navigator;
    if (unread > 0 && nav && typeof nav.setAppBadge === "function") return Promise.resolve(nav.setAppBadge(unread)).catch(noop);
    if (!(unread > 0) && nav && typeof nav.clearAppBadge === "function") return Promise.resolve(nav.clearAppBadge()).catch(noop);
  } catch {
    // Not supported here.
  }
  return Promise.resolve();
}

function noop() {}

function windows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(function () {
    return [];
  });
}

/** Tells every open page; each refreshes its own notifications (PushSync.tsx). */
function tellPages(message) {
  return windows().then(function (list) {
    list.forEach(function (client) {
      try {
        client.postMessage(message);
      } catch {
        // A page on its way out.
      }
    });
  });
}

self.addEventListener("install", function () {
  // Nothing is cached, so there is nothing an old version must finish with.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var payload = null;
  try {
    payload = readPayload(event.data ? event.data.json() : null);
  } catch {
    payload = null;
  }
  var shown = payload || FALLBACK;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(shown.title, {
        body: shown.body,
        icon: ICON,
        // One notification per tag: a later one about the same thing takes
        // its place (the tag is the family and entity that fold it in the
        // app). Replacing is quiet - five corrections do not buzz five times.
        tag: shown.tag,
        renotify: false,
        data: { id: shown.id, url: shown.url },
      }),
      payload ? setBadge(payload.unread) : Promise.resolve(),
      tellPages({ type: "fwm:push" }),
    ]),
  );
});

/** The page to bring forward: the one being looked at, else one in view, else any. */
function pickWindow(list) {
  var visible = null;
  for (var index = 0; index < list.length; index += 1) {
    if (list[index].focused) return list[index];
    if (!visible && list[index].visibilityState === "visible") visible = list[index];
  }
  return visible || list[0] || null;
}

/**
 * Hands a tap to an open page, which marks the notification read and goes to
 * its page without losing anything unsaved. Resolves true once the page says
 * it has it; false if it does not answer (a page still loading, or one that
 * is not listening), and the site is then opened afresh.
 */
function handToPage(client, id, url) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(taken) {
      if (done) return;
      done = true;
      resolve(taken);
    }
    try {
      var channel = new MessageChannel();
      channel.port1.onmessage = function () {
        finish(true);
      };
      client.postMessage({ type: "fwm:push-click", id: id, url: url }, [channel.port2]);
      setTimeout(function () {
        finish(false);
      }, ACK_MS);
    } catch {
      finish(false);
    }
  });
}

function openTap(id, url) {
  // With no page open the site is opened at an address that marks the
  // notification read as the signed-in person and then goes on to its page
  // (src/app/notifications/open). The page it leads to is looked up there.
  var fresh = id ? "/notifications/open/" + id : url;
  return windows().then(function (list) {
    var client = pickWindow(list);
    if (!client || typeof client.focus !== "function") return self.clients.openWindow(fresh);
    return client
      .focus()
      .catch(function () {
        return client;
      })
      .then(function (focused) {
        return handToPage(focused || client, id, url);
      })
      .then(function (taken) {
        return taken ? undefined : self.clients.openWindow(fresh);
      });
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var id = isId(data.id) ? data.id : null;
  // Checked again, though this worker wrote it: a tap never leaves the site.
  var url = isSitePath(data.url) ? data.url : FALLBACK_URL;
  event.waitUntil(openTap(id, url));
});

// The browser replaced this device's subscription. The worker has no session
// of its own to register the new one with; an open page does (PushSync.tsx),
// and the next visit repairs it otherwise.
self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(tellPages({ type: "fwm:push-subscription" }));
});
