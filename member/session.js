import { initUnitedAuth } from '../united-auth.js?v=20260825-phase-a1';

export function createMemberSession({ config, onStateChange }) {
  let firebase = null;
  let authController = null;
  let currentUser = null;
  let authFlowActive = false;

  return {
    get firebase() { return firebase; },
    get currentUser() { return currentUser; },
    set currentUser(user) { currentUser = user; },
    get authFlowActive() { return authFlowActive; },
    set authFlowActive(active) { authFlowActive = active; },
    async initialize() {
      authController = initUnitedAuth({
        config,
        onStateChange: state => {
          if (state.context) firebase = state.context;
          return onStateChange?.(state);
        },
      });
      await authController.ready;
    },
    retry() {
      return authController?.retry();
    },
    stop() {
      authController?.stop();
    },
  };
}

export function authError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail nebo heslo nesedí.';
  if (code.includes('email-already-in-use') || code.includes('email-already')) return 'Tento e-mail už United ID má.';
  if (code.includes('weak-password')) return 'Heslo musí mít alespoň 6 znaků.';
  if (code.includes('invalid-email')) return 'E-mail nemá platný formát.';
  if (code.includes('too-many-requests')) return 'Příliš mnoho pokusů. Zkus to za chvíli znovu.';
  if (code.includes('network-request-failed')) return 'Nepodařilo se spojit s Firebase. Zkontroluj připojení.';
  if (code.includes('unauthorized-domain')) return 'Tato doména není ve Firebase povolená.';
  if (code.includes('operation-not-allowed')) return 'Přihlášení e-mailem není ve Firebase povolené.';
  if (code.includes('user-disabled')) return 'Tento účet je deaktivovaný.';
  return 'Akci se nepodařilo dokončit.';
}

export function apiError(error) {
  if (error?.message === 'api_network_error') return 'Můj United teď není dostupný. Zkus stránku obnovit.';
  if (error?.message === 'member_identity_mismatch') return 'Bezpečnostní kontrola profilu selhala.';
  if (error?.message === 'member_inactive') return 'Tento členský účet není aktivní.';
  if (error?.status === 401) return 'Přihlášení vypršelo. Přihlas se znovu.';
  if (error?.status === 403) return 'Z této domény se do Můj United nelze připojit.';
  if (error?.status >= 500) return 'Členský profil je dočasně nedostupný.';
  if (error?.message === 'reservation_response_invalid') return 'Rezervaci se nepodařilo správně načíst. Zkus stránku obnovit.';
  if (error?.payload?.message) return String(error.payload.message);
  return 'Členský profil se nepodařilo načíst.';
}

export function authOrApiError(error) {
  return error?.status || error?.message === 'api_network_error' ? apiError(error) : authError(error);
}
