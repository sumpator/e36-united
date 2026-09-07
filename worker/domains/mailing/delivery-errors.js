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
  provider_already_used: 'Kampaň už byla přijata poskytovatelem a nelze ji vrátit do draftu.',
  recipients_no_longer_eligible: 'Některý zmrazený příjemce byl potlačen nebo ztratil souhlas. Kampaň nelze odeslat.',
  survey_delivery_not_ready: 'Anketu lze testovat, ale živé odeslání čeká na Mailing D.',
  send_limit_exceeded: 'Kampaň má více příjemců než aktuální denní limit nebo jeho zbývající část.',
  provider_not_configured: 'SMTP2GO není nakonfigurováno.',
  provider_invalid_key: 'SMTP2GO odmítlo API klíč.',
  api_error: 'SMTP2GO API není dostupné nebo odmítlo požadavek.',
  domain_missing: 'Odesílací doména v SMTP2GO chybí.',
  domain_unverified: 'Doména čeká na ověření.',
  provider_rejected: 'SMTP2GO požadavek odmítlo. Zkontroluj konfiguraci kampaně.',
  provider_quota: 'SMTP2GO hlásí nedostatečný kredit nebo měsíční kvótu.',
  provider_rate_limit: 'SMTP2GO hlásí limit požadavků nebo e-mailů.',
  provider_timeout: 'SMTP2GO neodpovědělo včas. Výsledek odeslání musí být ověřen před opakováním.',
  provider_unavailable: 'SMTP2GO není dostupné. Výsledek odeslání může vyžadovat kontrolu.',
  provider_malformed: 'SMTP2GO vrátilo neočekávanou odpověď.',
  provider_request_budget: 'Dosažen bezpečný limit požadavků. Obnov stav před další akcí.',
  provider_batch_ambiguous: 'SMTP2GO nepotvrdilo všechny zprávy jednoznačně. Kampaň zůstává uzamčená pro ruční vypořádání.',
  invalid_batch: 'Dávka e-mailů má neplatnou velikost.',
};
