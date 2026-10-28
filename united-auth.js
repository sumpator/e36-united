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

export function initUnitedAuth({ config, onStateChange, importModule = specifier => import(specifier), timeoutMs = 20_000 }) {
  let attempt = 0;
  let unsubscribe = null;
  let context = null;
  let stopped = false;
  let startupTimer = null;
  let state = { status: 'loading', user: null, error: null, context: null };

  const emit = next => {
    state = { ...state, ...next };
    onStateChange?.(state);
  };

  const start = async () => {
    const activeAttempt = ++attempt;
    clearTimeout(startupTimer);
    unsubscribe?.();
    unsubscribe = null;
    emit({ status: 'loading', error: null, context });

    if (!configured(config)) {
      const error = new Error('firebase_not_configured');
      emit({ status: 'error', user: null, error, context: null });
      return null;
    }

    try {
      // Bound all startup stages, including SDK loading and the first observer
      // notification. A late completion cannot revive a failed attempt.
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

      // Persistence must be selected before the first auth-state decision is rendered.
      try {
        await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      } catch (error) {
        if (!['auth/web-storage-unsupported', 'auth/unsupported-persistence-type'].includes(error?.code)) throw error;
        // Private/storage-restricted browsers may still authenticate in memory.
        // Do not turn network or credential errors into a persistence fallback.
        await authMod.setPersistence(auth, authMod.inMemoryPersistence);
      }
      if (stopped || activeAttempt !== attempt) return null;

      context = { ...authMod, auth };
      unsubscribe = authMod.onAuthStateChanged(
        auth,
        user => {
          if (stopped || activeAttempt !== attempt) return;
          clearTimeout(startupTimer);
          emit({ status: user ? 'authenticated' : 'anonymous', user: user || null, error: null, context });
        },
        error => {
          if (stopped || activeAttempt !== attempt) return;
          clearTimeout(startupTimer);
          emit({ status: 'error', error, context });
        }
      );
      return context;
    } catch (error) {
      if (!stopped && activeAttempt === attempt) {
        clearTimeout(startupTimer);
        emit({ status: 'error', error, context });
      }
      return null;
    }
  };

  const controller = {
    get context() { return context; },
    get state() { return state; },
    retry: start,
    stop() {
      stopped = true;
      clearTimeout(startupTimer);
      attempt += 1;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
  controller.ready = start();
  return controller;
}

export const unitedAuthSdkUrls = Object.freeze({ app: FIREBASE_APP_URL, auth: FIREBASE_AUTH_URL });
