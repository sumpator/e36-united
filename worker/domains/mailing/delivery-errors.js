export class MailingDeliveryError extends Error {
  constructor(code, status = 409, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

export const deliveryMessages = {
  campaign_not_found: 'Kampaň nebyla nalezena.',
  campaign_not_draft: 'Obsah lze měnit nebo testovat jen v konceptu.',
  campaign_not_prepared: 'Nejdřív připrav kampaň.',
  campaign_changed: 'Kampaň se mezitím změnila. Obnov data.',
  campaign_busy: 'Operace běží nebo vyžaduje kontrolu výsledku u poskytovatele. Neopakuj odeslání.',
  no_eligible_recipients: 'Kampaň nemá žádné způsobilé příjemce.',
  invalid_delivery_content: 'Doplň předmět a platný obsah kampaně.',
  invalid_test_addresses: 'Zadej 1 až 5 platných testovacích e-mailů.',
  confirmation_required: 'Potvrď přesný obsah a počet příjemců kampaně.',
  provider_already_used: 'Kampaň už má provider synchronizaci. Návrat vyžaduje nejdřív řízené vypořádání provider objektů.',
  provider_not_synced: 'Nejdřív synchronizuj zmrazené příjemce a obsah s Brevo.',
  recipients_no_longer_eligible: 'Některý zmrazený příjemce byl potlačen nebo ztratil souhlas. Kampaň nelze odeslat.',
  survey_delivery_not_ready: 'Anketu lze testovat, ale živé odeslání čeká na Mailing D.',
  send_limit_exceeded: 'Počet příjemců překračuje aktuální denní limit nebo jeho zbývající část.',
  provider_not_configured: 'Brevo není nakonfigurováno.',
  provider_invalid_key: 'Brevo odmítlo API klíč.',
  sender_missing: 'Odesílatel není připraven.',
  domain_unverified: 'Doména čeká na ověření.',
  domain_unauthenticated: 'Doména čeká na autentizaci.',
  provider_folder_missing: 'Chybí ID vyhrazené složky Brevo pro doručovací seznamy.',
  provider_rejected: 'Brevo požadavek odmítlo. Zkontroluj konfiguraci kampaně.',
  provider_quota: 'Brevo hlásí nedostatečný kredit nebo kvótu.',
  provider_rate_limit: 'Brevo hlásí limit požadavků nebo testovacích e-mailů.',
  provider_timeout: 'Brevo neodpovědělo včas. Výsledek mutace musí být ověřen před opakováním.',
  provider_unavailable: 'Brevo není dostupné. Výsledek mutace může vyžadovat kontrolu.',
  provider_malformed: 'Brevo vrátilo neočekávanou odpověď. Výsledek mutace vyžaduje kontrolu.',
};
