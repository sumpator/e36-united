const TEMPLATE_VERSION = "e36-default-v1";
const MAX_BLOCKS = 30;
const E36_SITE_URL = "https://e36united.cz/";
const E36_LOGO_URL = "https://e36united.cz/united-logo-blue-silver-transparent.png";
const UNITED_2026_HERO_URL = "https://static.wixstatic.com/media/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg/v1/fill/w_1280%2Ch_760%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg";

export const MAILING_TEMPLATE_VERSION = TEMPLATE_VERSION;
export const MAILING_BLOCK_TYPES = Object.freeze(["hero", "heading", "rich_text", "image", "cta", "divider", "highlight", "survey"]);

const BLOCK_TYPES = new Set(MAILING_BLOCK_TYPES);
const CTA_VARIANTS = new Set(["primary", "secondary"]);
const DIVIDER_VARIANTS = new Set(["line", "space"]);
const DIVIDER_SIZES = new Set(["small", "medium", "large"]);

export class MailingContentDefinitionError extends Error {}

function plain(value, maximum = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function multiline(value, maximum = 6000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, maximum);
}

function stableId(value, label) {
  const id = plain(value, 80);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    throw new MailingContentDefinitionError(`${label} must use 1 to 80 letters, numbers, dashes or underscores.`);
  }
  return id;
}

function absoluteUrl(value, label, { optional = true } = {}) {
  const candidate = plain(value, 1600);
  if (!candidate && optional) return "";
  try {
    const url = new URL(candidate);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Unsupported protocol");
    return url.href;
  } catch {
    throw new MailingContentDefinitionError(`${label} must be an absolute http(s) URL.`);
  }
}

function normalizeAnswer(answer, index) {
  const id = stableId(answer?.id, `Survey answer ${index + 1} ID`);
  const label = plain(answer?.label, 180);
  if (!label) throw new MailingContentDefinitionError(`Survey answer ${index + 1} label is required.`);
  return { id, label };
}

function normalizeBlock(block, index) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new MailingContentDefinitionError(`Block ${index + 1} must be an object.`);
  }
  const type = plain(block.type, 40);
  if (!BLOCK_TYPES.has(type)) throw new MailingContentDefinitionError(`Unsupported Mailing block type: ${type || "empty"}`);
  const id = stableId(block.id, `Block ${index + 1} ID`);

  if (type === "hero") return {
    id, type,
    imageUrl: absoluteUrl(block.imageUrl, "Hero image URL"),
    alt: plain(block.alt, 240),
    kicker: plain(block.kicker, 100),
    heading: plain(block.heading, 180),
    text: plain(block.text, 600),
  };
  if (type === "heading") return { id, type, kicker: plain(block.kicker, 100), heading: plain(block.heading, 180) };
  if (type === "rich_text") return { id, type, text: multiline(block.text, 6000) };
  if (type === "image") return {
    id, type,
    imageUrl: absoluteUrl(block.imageUrl, "Image URL"),
    alt: plain(block.alt, 240),
    caption: plain(block.caption, 400),
  };
  if (type === "cta") return {
    id, type,
    label: plain(block.label, 120),
    url: absoluteUrl(block.url, "CTA URL"),
    variant: CTA_VARIANTS.has(block.variant) ? block.variant : "primary",
  };
  if (type === "divider") return {
    id, type,
    variant: DIVIDER_VARIANTS.has(block.variant) ? block.variant : "line",
    size: DIVIDER_SIZES.has(block.size) ? block.size : "medium",
  };
  if (type === "highlight") return { id, type, kicker: plain(block.kicker, 100), text: multiline(block.text, 1200) };

  const questionId = stableId(block.questionId, "Survey question ID");
  const question = plain(block.question, 300);
  if (!question) throw new MailingContentDefinitionError("Survey question is required.");
  if (!Array.isArray(block.answers) || block.answers.length < 2 || block.answers.length > 5) {
    throw new MailingContentDefinitionError("Survey must contain between 2 and 5 answers.");
  }
  const answers = block.answers.map(normalizeAnswer);
  if (new Set(answers.map(answer => answer.id)).size !== answers.length) {
    throw new MailingContentDefinitionError("Survey answer IDs must be unique inside the question.");
  }
  return { id, type, questionId, question, text: plain(block.text, 600), answers };
}

export function createMailingStarterContent() {
  return {
    template: TEMPLATE_VERSION,
    blocks: [
      {
        id: "hero-united-2026",
        type: "hero",
        imageUrl: UNITED_2026_HERO_URL,
        alt: "BMW E36 na srazu E36 United 2026 ve Zbraslavicích",
        kicker: "UNITED 2026 · ZBRASLAVICE",
        heading: "Díky za United. Kam dál?",
        text: "Šestý ročník je za námi. Teď chceme slyšet, jak sis Zbraslavice užil ty.",
      },
      {
        id: "heading-next-chapter",
        type: "heading",
        kicker: "TVŮJ HLAS",
        heading: "Pomoz nám vybrat další kapitolu United.",
      },
      {
        id: "copy-zbraslavice",
        type: "rich_text",
        text: "Zbraslavice nám daly prostor pro auta, komunitu i celý víkend pohromadě. **Než začneme plánovat další ročník**, zajímá nás tvůj skutečný názor.\n\nKlikni na odpověď, která je ti nejbližší. Zabere to jen pár sekund.",
      },
      {
        id: "survey-zbraslavice-2026",
        type: "survey",
        questionId: "zbraslavice-2026-outlook",
        question: "Jak to vidíš se Zbraslavicemi?",
        text: "V Mailing B jsou odpovědi pouze v náhledu. Bezpečné příjemcovské odkazy a uložení odpovědi přidá Mailing D.",
        answers: [
          { id: "return-zbraslavice", label: "SUPER – CHCI TAM UNITED ZNOVU" },
          { id: "liked-location-open", label: "LÍBILO SE MI – ALE MÍSTO JE MI VLASTNĚ JEDNO" },
          { id: "prefer-different-location", label: "RADIĚJI BYCH LETOS JINAM" },
        ],
      },
      {
        id: "highlight-stay-united",
        type: "highlight",
        kicker: "STAY UNITED",
        text: "Každá odpověď pomůže postavit další United na tom, co komunita opravdu chce.",
      },
    ],
  };
}

export function createMailingStarterDraft() {
  return {
    internalName: "United 2026 — Zbraslavice feedback",
    subject: "Jak to vidíš se Zbraslavicemi?",
    preheader: "Pomoz nám rozhodnout, kde bude další E36 United.",
    templateVersion: TEMPLATE_VERSION,
    content: createMailingStarterContent(),
  };
}

export function normalizeMailingContent(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new MailingContentDefinitionError("Mailing content must be an object.");
  }
  const template = plain(candidate.template, 80);
  if (template !== TEMPLATE_VERSION) throw new MailingContentDefinitionError(`Unsupported Mailing template: ${template || "empty"}`);
  if (!Array.isArray(candidate.blocks)) throw new MailingContentDefinitionError("Mailing content blocks must be an array.");
  if (candidate.blocks.length > MAX_BLOCKS) throw new MailingContentDefinitionError(`Mailing content can contain at most ${MAX_BLOCKS} blocks.`);
  const blocks = candidate.blocks.map(normalizeBlock);
  if (new Set(blocks.map(block => block.id)).size !== blocks.length) {
    throw new MailingContentDefinitionError("Mailing block IDs must be unique.");
  }
  return { template: TEMPLATE_VERSION, blocks };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function richInline(value) {
  const formattedPlain = source => escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong style=\"color:#ffffff;\">$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  const source = String(value || ""),pattern=/\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)/gi;
  let result="",cursor=0,match;
  while((match=pattern.exec(source))){
    result+=formattedPlain(source.slice(cursor,match.index));
    try{
      const safeUrl=absoluteUrl(match[2],"Rich text link",{optional:false});
      result+=`<a href="${escapeHtml(safeUrl)}" style="color:#69b5ff;text-decoration:underline;">${formattedPlain(match[1])}</a>`;
    }catch{result+=formattedPlain(match[1])}
    cursor=pattern.lastIndex;
  }
  return result+formattedPlain(source.slice(cursor));
}

function richText(value) {
  const groups = String(value || "").split(/\n\s*\n/).map(group => group.trim()).filter(Boolean);
  return groups.map(group => {
    const lines = group.split("\n").map(line => line.trim()).filter(Boolean);
    if (lines.length && lines.every(line => line.startsWith("- "))) {
      return `<ul style="margin:0 0 18px;padding:0 0 0 22px;color:#c8d0d9;font:400 16px/1.65 Arial,sans-serif;">${lines.map(line => `<li style="margin:0 0 7px;">${richInline(line.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 18px;color:#c8d0d9;font:400 16px/1.7 Arial,sans-serif;">${richInline(lines.join(" "))}</p>`;
  }).join("");
}

function padded(content, extra = "") {
  return `<tr><td class="e36-pad" style="padding:0 38px;${extra}">${content}</td></tr>`;
}

function kicker(value) {
  return value ? `<div style="margin:0 0 10px;color:#69b5ff;font:700 11px/1.3 Arial,sans-serif;letter-spacing:2.2px;text-transform:uppercase;">${escapeHtml(value)}</div>` : "";
}

function imagePlaceholder(label) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#101720;border:1px dashed #30445a;"><tr><td align="center" style="height:180px;color:#8292a3;font:700 11px/1.4 Arial,sans-serif;letter-spacing:1.5px;">${escapeHtml(label)}</td></tr></table>`;
}

function renderBlock(block) {
  if (block.type === "hero") {
    const media = block.imageUrl
      ? `<img src="${escapeHtml(block.imageUrl)}" width="640" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:640px;height:auto;border:0;"/>`
      : imagePlaceholder("HERO IMAGE · DOPLŇTE HTTPS URL");
    return `<tr><td style="padding:0 0 30px;">${media}</td></tr>${padded(`${kicker(block.kicker)}<h1 style="margin:0 0 14px;color:#ffffff;font:800 40px/1.02 Arial,sans-serif;letter-spacing:-1.8px;">${escapeHtml(block.heading)}</h1>${block.text ? `<p style="margin:0;color:#b9c4cf;font:400 17px/1.6 Arial,sans-serif;">${escapeHtml(block.text)}</p>` : ""}`, "padding-bottom:30px;")}`;
  }
  if (block.type === "heading") return padded(`${kicker(block.kicker)}<h2 style="margin:0;color:#ffffff;font:800 29px/1.12 Arial,sans-serif;letter-spacing:-.8px;">${escapeHtml(block.heading)}</h2>`, "padding-top:8px;padding-bottom:22px;");
  if (block.type === "rich_text") return padded(richText(block.text), "padding-bottom:6px;");
  if (block.type === "image") {
    const media = block.imageUrl
      ? `<img src="${escapeHtml(block.imageUrl)}" width="564" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:564px;height:auto;border:0;"/>`
      : imagePlaceholder("IMAGE PLACEHOLDER · DOPLŇTE HTTPS URL");
    return padded(`${media}${block.caption ? `<p style="margin:9px 0 0;color:#7f8b98;font:400 12px/1.5 Arial,sans-serif;">${escapeHtml(block.caption)}</p>` : ""}`, "padding-bottom:26px;");
  }
  if (block.type === "cta") {
    const colors = block.variant === "secondary" ? { background: "#111820", color: "#ddecfa", border: "#3b536d" } : { background: "#4da3ff", color: "#06101a", border: "#4da3ff" };
    const label = escapeHtml(block.label || "VÍCE INFORMACÍ");
    const button = block.url
      ? `<a href="${escapeHtml(block.url)}" style="display:inline-block;padding:15px 22px;border:1px solid ${colors.border};background:${colors.background};color:${colors.color};font:800 12px/1.2 Arial,sans-serif;letter-spacing:.9px;text-decoration:none;text-transform:uppercase;">${label} &nbsp;→</a>`
      : `<span style="display:inline-block;padding:15px 22px;border:1px solid ${colors.border};background:${colors.background};color:${colors.color};font:800 12px/1.2 Arial,sans-serif;letter-spacing:.9px;text-transform:uppercase;">${label} &nbsp;→</span>`;
    return padded(button, "padding-top:3px;padding-bottom:28px;");
  }
  if (block.type === "divider") {
    const padding = { small: 12, medium: 22, large: 36 }[block.size];
    const line = block.variant === "line" ? `<div style="height:1px;background:#26313d;font-size:1px;line-height:1px;">&nbsp;</div>` : "&nbsp;";
    return padded(line, `padding-top:${padding}px;padding-bottom:${padding}px;`);
  }
  if (block.type === "highlight") return padded(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#101923;border-left:4px solid #4da3ff;"><tr><td style="padding:20px 22px;">${kicker(block.kicker)}<div style="color:#e8f2fc;font:700 16px/1.55 Arial,sans-serif;">${richInline(block.text)}</div></td></tr></table>`, "padding-bottom:28px;");

  const responseUrl = `${E36_SITE_URL}mailing-response-pending`;
  const answers = block.answers.map(answer => `<tr><td style="padding:0 0 9px;"><a href="${responseUrl}" data-question-id="${escapeHtml(block.questionId)}" data-answer-id="${escapeHtml(answer.id)}" style="display:block;padding:14px 16px;border:1px solid #3a5169;background:#111a24;color:#edf6ff;font:800 12px/1.35 Arial,sans-serif;letter-spacing:.35px;text-decoration:none;text-transform:uppercase;">${escapeHtml(answer.label)} &nbsp;→</a></td></tr>`).join("");
  return padded(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" data-survey-question="${escapeHtml(block.questionId)}" style="background:#0c1219;border:1px solid #263646;"><tr><td style="padding:25px 24px 15px;">${kicker("RYCHLÁ ODPOVĚĎ")}<h2 style="margin:0 0 10px;color:#ffffff;font:800 26px/1.15 Arial,sans-serif;letter-spacing:-.6px;">${escapeHtml(block.question)}</h2>${block.text ? `<p style="margin:0;color:#91a0af;font:400 13px/1.6 Arial,sans-serif;">${escapeHtml(block.text)}</p>` : ""}</td></tr><tr><td style="padding:0 24px 17px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${answers}</table></td></tr></table>`, "padding-bottom:28px;");
}

export function renderMailingTemplate({ subject = "", preheader = "", content }) {
  const normalized = normalizeMailingContent(content);
  const safeSubject = plain(subject, 180);
  const safePreheader = plain(preheader, 240);
  const blocks = normalized.blocks.map(renderBlock).join("");
  const html = `<!doctype html>
<html lang="cs" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>${escapeHtml(safeSubject || "E36 United")}</title>
  <style>@media only screen and (max-width:680px){.e36-shell{width:100%!important}.e36-pad{padding-left:22px!important;padding-right:22px!important}.e36-header{padding-left:22px!important;padding-right:22px!important}.e36-footer{padding-left:22px!important;padding-right:22px!important}h1{font-size:32px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:#06080b;background-image:radial-gradient(circle at 82% 4%,#17314c 0,#06080b 34%),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:auto,48px 48px;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(safePreheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <!--[if mso]><v:background fill="t"><v:fill type="tile" color="#06080b"/></v:background><![endif]-->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#06080b" style="width:100%;background-color:#06080b;"><tr><td align="center" style="padding:30px 10px;">
    <table class="e36-shell" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" bgcolor="#090d12" style="width:640px;max-width:640px;background:#090d12;border:1px solid #26313d;">
      <tr><td class="e36-header" style="padding:22px 38px;border-bottom:1px solid #26313d;background:#080b0f;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><a href="${E36_SITE_URL}" style="text-decoration:none;"><img src="${E36_LOGO_URL}" width="52" alt="E36 United" style="display:inline-block;width:52px;height:auto;border:0;vertical-align:middle;"/> <span style="color:#ffffff;font:800 15px/1 Arial,sans-serif;letter-spacing:1.7px;vertical-align:middle;">E36 UNITED</span></a></td><td align="right" style="color:#69b5ff;font:700 10px/1.3 Arial,sans-serif;letter-spacing:1.4px;">UNITED MAIL</td></tr></table>
      </td></tr>
      ${blocks || padded(`<p style="margin:36px 0;color:#8794a1;font:700 13px/1.5 Arial,sans-serif;letter-spacing:1px;text-align:center;">PŘIDEJ PRVNÍ OBSAHOVÝ BLOK</p>`)}
      <tr><td class="e36-footer" style="padding:27px 38px;border-top:1px solid #26313d;background:#070a0e;color:#75818e;font:400 11px/1.65 Arial,sans-serif;">
        <strong style="display:block;margin-bottom:5px;color:#c7d4df;font-size:12px;letter-spacing:.6px;">E36 UNITED · STAY UNITED.</strong>
        <span>[IDENTITA ODESÍLATELE BUDE DOPLNĚNA V MAILING C]</span><br/>
        <a href="${E36_SITE_URL}" style="color:#69b5ff;text-decoration:none;">e36united.cz</a> · <span>[ODHLAŠOVACÍ ODKAZ BUDE DOPLNĚN V MAILING C]</span>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
  return { templateVersion: TEMPLATE_VERSION, content: normalized, subject: safeSubject, preheader: safePreheader, html };
}
