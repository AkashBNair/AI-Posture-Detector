// ══════════════════════════════════════════════════════════════════
// SERVICE WORKER — Runs timers + alerts even when tab is minimized
// ══════════════════════════════════════════════════════════════════

let timers = {};

// ── Listen for messages from the main app ─────────────────────────

self.addEventListener('message', (event) => {
  const data = event.data;

  switch (data.type) {
    case 'START_TIMER':
      startTimer(data.timerId, data.durationMs, data.alertConfig, data.repeat);
      break;

    case 'STOP_TIMER':
      stopTimer(data.timerId);
      break;

    case 'UPDATE_TIMER':
      updateTimer(data.timerId, data.durationMs);
      break;

    case 'SHOW_NOTIFICATION':
      showNotification(data.title, data.body, data.tag, data.urgent);
      break;

    case 'GET_TIMER_STATUS':
      sendTimerStatus(event.source);
      break;

    case 'KEEPALIVE':
      // No-op: keeps the Service Worker alive
      break;
  }
});

// ── Timer management ──────────────────────────────────────────────

function startTimer(timerId, durationMs, alertConfig, repeat = false) {
  // Clear existing timer with same ID
  if (timers[timerId]) {
    clearTimeout(timers[timerId].timeoutId);
  }

  const startedAt = Date.now();
  const endsAt = startedAt + durationMs;

  function onTimerComplete() {
    // Show notification
    showNotification(
      alertConfig.title,
      alertConfig.body,
      alertConfig.tag || timerId,
      alertConfig.urgent || false
    );

    // Notify all clients (tabs)
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'TIMER_COMPLETE',
          timerId: timerId,
          alertConfig: alertConfig,
        });
      });
    });

    // Restart if repeat
    if (repeat) {
      startTimer(timerId, durationMs, alertConfig, true);
    } else {
      delete timers[timerId];
    }
  }

  const timeoutId = setTimeout(onTimerComplete, durationMs);

  timers[timerId] = {
    timeoutId,
    startedAt,
    endsAt,
    durationMs,
    alertConfig,
    repeat,
  };

  // Send countdown updates to clients every second
  startCountdown(timerId);
}

function stopTimer(timerId) {
  if (timers[timerId]) {
    clearTimeout(timers[timerId].timeoutId);
    if (timers[timerId].countdownId) {
      clearInterval(timers[timerId].countdownId);
    }
    delete timers[timerId];
  }

  // Notify clients
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'TIMER_STOPPED',
        timerId: timerId,
      });
    });
  });
}

function updateTimer(timerId, newDurationMs) {
  if (timers[timerId]) {
    const alertConfig = timers[timerId].alertConfig;
    const repeat = timers[timerId].repeat;
    stopTimer(timerId);
    startTimer(timerId, newDurationMs, alertConfig, repeat);
  }
}

function startCountdown(timerId) {
  if (timers[timerId]?.countdownId) {
    clearInterval(timers[timerId].countdownId);
  }

  const countdownId = setInterval(() => {
    const timer = timers[timerId];
    if (!timer) {
      clearInterval(countdownId);
      return;
    }

    const remaining = Math.max(0, timer.endsAt - Date.now());
    const secondsLeft = Math.ceil(remaining / 1000);

    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'TIMER_TICK',
          timerId: timerId,
          secondsLeft: secondsLeft,
        });
      });
    });

    if (remaining <= 0) {
      clearInterval(countdownId);
    }
  }, 1000);

  if (timers[timerId]) {
    timers[timerId].countdownId = countdownId;
  }
}

function sendTimerStatus(client) {
  const status = {};
  for (const [id, timer] of Object.entries(timers)) {
    const remaining = Math.max(0, timer.endsAt - Date.now());
    status[id] = {
      secondsLeft: Math.ceil(remaining / 1000),
      durationMs: timer.durationMs,
      repeat: timer.repeat,
    };
  }

  if (client) {
    client.postMessage({ type: 'TIMER_STATUS', timers: status });
  }
}

// ── Show notification ─────────────────────────────────────────────

function showNotification(title, body, tag, urgent) {
  self.registration.showNotification(title, {
    body: body || '',
    tag: tag || 'wellness-alert',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    silent: false,
    renotify: true,
    requireInteraction: urgent || false,
    vibrate: [300, 100, 300, 100, 300],
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  });
}

// ── Handle notification click ─────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());