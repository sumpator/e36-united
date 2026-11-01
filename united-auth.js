const FIREBASE_VERSION = '10.12.5';
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const FIREBASE_AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

function configured(config) {
  return Boolean(
    config?.apiKey &&
    config?.projectId &&
    config?.appId &&
    !String(config.apiKey).startsWith('PASTE_') &&
    !String(config.projectId).startsWith('PASTE_')
  );
}

export function initUnitedAuth({ config, onStateChange, importModule = specifier => import(specifier), timeoutMs = 10_000, slowMs = 5_000 }) {
  let attempt = 0;
  let unsubscribe = null;
  let context = null;
  let stopped = false;
  let startupTimer = null;
  let slowTimer = null;
  let state = { status: 'loading', user: null, error: null, context: null };

  const emit = next => {
    state = { ...state, ...next };
    onStateChange?.(state);
  };

  const start = async () => {
    const activeAttempt = ++attempt;
    clearTimeout(startupTimer);
    clearTimeout(slowTimer);
    unsubscribe?.();
    unsubscribe = null;
    const startedAt = Date.now();
    emit({ status: 'loading', error: null, context, startedAt, deadlineAt: startedAt + timeoutMs, slow: false, stage: 'sdk' });

    if (!configured(config)) {
      const error = new Error('firebase_not_configured');
      emit({ status: 'error', user: null, error, context: null });
      return null;
    }

    try {
      // Bound all startup stages, including SDK loading and the first observer
      // notification. A late completion cannot revive a failed attempt.
      slowTimer = setTimeout(() => {
        if (!stopped && activeAttempt === attempt) emit({ slow: true });
      }, slowMs);
      slowTimer.unref?.();
      startupTimer = setTimeout(() => {
        if (stopped || activeAttempt !== attempt) return;
        attempt += 1;
        unsubscribe?.();
        unsubscribe = null;
        emit({ status: 'error', error: new Error('auth_startup_timeout'), context });
      }, timeoutMs);
      startupTimer.unref?.();
      const [appMod, authMod] = await Promise.all([
        importModule(FIREBASE_APP_URL),
        importModule(FIREBASE_AUTH_URL),
      ]);
      if (stopped || activeAttempt !== attempt) return null;

      const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(config);
      const auth = authMod.getAuth(app);

      // getAuth already selects IndexedDB, localStorage, sessionStorage, then
      // memory. Forcing another backend can remove a restored session before a
      // blocked target storage accepts it. All page controllers share this Auth.
      state = { ...state, stage: 'restore' };
      await auth.authStateReady();
      if (stopped || activeAttempt !== attempt) return null;

      // Read only the storage TYPE from the pinned SDK, never its user/token
      // storage. If that diagnostic accessor changes, make no durability claim.
      const kind = auth._getPersistence?.();
      context = { ...authMod, auth, persistence: ({LOCAL:'local',SESSION:'session',NONE:'memory'})[kind] || 'unknown' };
      let decided = false;
      unsubscribe = authMod.onAuthStateChanged(
        auth,
        user => {
          if (stopped || activeAttempt !== attempt) return;
          clearTimeout(startupTimer);
          clearTimeout(slowTimer);
          const changedAt = decided ? Date.now() : startedAt;
          decided = true;
          emit({ startedAt: changedAt, deadlineAt: changedAt + timeoutMs, slow: false, status: user ? 'authenticated' : 'anonymous', user: user || null, error: null, context });
        },
        error => {
          if (stopped || activeAttempt !== attempt) return;
          clearTimeout(startupTimer);
          clearTimeout(slowTimer);
          emit({ status: 'error', error, context });
        }
      );
      return context;
    } catch (error) {
      if (!stopped && activeAttempt === attempt) {
        clearTimeout(startupTimer);
        clearTimeout(slowTimer);
        emit({ status: 'error', error, context });
      }
      return null;
    }
  };

  const controller = {
    get context() { return context; },
    get state() { return state; },
    retry() {
      // A failed module fetch is cached by the browser's module loader. A user
      // retry needs a fresh document, not another import of the poisoned URL.
      if (state.status === 'error' && state.stage === 'sdk' && state.error?.message !== 'auth_startup_timeout' && typeof globalThis.location?.reload === 'function') {
        globalThis.location.reload();
        return Promise.resolve(null);
      }
      return start();
    },
    stop() {
      stopped = true;
      clearTimeout(startupTimer);
      clearTimeout(slowTimer);
      attempt += 1;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
  controller.ready = start();
  return controller;
}

export const unitedAuthSdkUrls = Object.freeze({ app: FIREBASE_APP_URL, auth: FIREBASE_AUTH_URL });

export function authRecoveryCopy(state = {}) {
  if (state.stage === 'sdk') return 'Přihlašovací službu se nepodařilo načíst. Ověř připojení a případné blokování této služby ochranou prohlížeče. Uložené přihlášení nemažeme.';
  return 'Uložené přihlášení nemažeme. Ověř připojení a obnov načtení. Samotná chyba spojení neznamená odhlášení.';
}

export function authPersistenceNotice(kind) {
  if (kind === 'memory') return 'Úložiště prohlížeče není dostupné. Přihlášení platí jen na této stránce; po jejím opuštění nebo obnovení se přihlas znovu.';
  if (kind === 'session') return 'Přihlášení je uložené jen pro tento panel. Po jeho zavření se přihlas znovu.';
  return '';
}

export function authDiagnostic(state = {}) {
  const error = state.error;
  const code = /^auth\/[a-z-]+$/.test(error?.code || '') ? error.code
    : error?.message === 'auth_startup_timeout' ? 'auth_startup_timeout'
    : ['SecurityError','QuotaExceededError','TypeError'].includes(error?.name) ? error.name : 'auth_unavailable';
  return {code, message:code, stage:state.stage || 'unknown', persistence:state.context?.persistence || null, origin:globalThis.location?.origin || null};
}
