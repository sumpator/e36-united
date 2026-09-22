import { listAdminMembers,getAdminMember,resolveAdminMemberQr,adminMemberMedia } from './admin/members.js';
import { runAdminCommand, getAdminOperation } from './admin/commands.js';
import { getAdminSummary } from './admin/summary.js';
import {getAdminDashboard,getAdminPreferences,saveAdminPreferences} from './admin/dashboard.js';
import { requireAdmin } from "./auth/admin.js";
import { verifyFirebaseRequest } from "./auth/firebase.js";
import { ACTIVE_MEMBER_STATUS, activeMemberForbidden, findMemberAuthorizationRecord, requireActiveMember } from "./auth/member.js";
import * as domain from "./domains.js";
import { isAllowedOrigin } from "./http/cors.js";
import { json } from "./http/responses.js";
import { routeAdminMailing } from "./domains/mailing/index.js";
import { getAdminFunnel, trackOnboarding, trackPlannerHandoff } from './domains/planner/funnel.js';
import { getAdminHistoryCounts } from './domains/club/history.js';
import { handleSmtp2goWebhook } from './domains/mailing/tracking.js';
import { getPreliminaryReservation, putPreliminaryReservation, cancelPreliminaryReservation, listAdminPreliminaryReservations, savePreliminarySettings } from './domains/reservations/preliminary.js';
import { assignLiveJudge, controlLive, createEvent, createLiveEntry, deleteProgramItem, getAdminLive, getLiveState, getMemberLive, judgePhotoMedia, liveEntryMedia, resolveLiveQr, saveJudgeScore, saveLiveVote, saveProgramItem, searchLiveMembers, setAdminLiveEnabled, setLivePresence, startLiveEntry, uploadJudgePhoto, uploadLivePhoto } from './domains/live.js';

const PROTECTED_MEMBER_EXACT_ROUTES = new Set([
  'GET /api/preliminary-reservations/current',
  'PUT /api/preliminary-reservations/current',
  'DELETE /api/preliminary-reservations/current',
  "GET /api/navigation-state",
  "POST /api/planner-handoffs/claim",
  "GET /api/united-club",
  "GET /api/united-club/gallery-links",
  "POST /api/history/claims",
  "POST /api/history/completed",
  "GET /api/planner-draft",
  "PUT /api/planner-draft",
  "DELETE /api/planner-draft",
  "GET /api/reservations/current",
  "PUT /api/reservations/current",
  "POST /api/reservations/current/requests",
  "GET /api/cars",
  "POST /api/cars",
  "POST /api/gallery/submissions",
  "GET /api/gallery/mine",
  "GET /api/live",
  "GET /api/live/state",
  "POST /api/live/photos",
]);

const PROTECTED_MEMBER_ROUTE_PATTERNS = [
  ["GET", /^\/api\/history\/evidence\/[^/]+$/],
  ["GET", /^\/api\/cars\/media\/[^/]+$/],
  ["PUT", /^\/api\/cars\/[^/]+$/],
  ["DELETE", /^\/api\/cars\/[^/]+$/],
  ["POST", /^\/api\/cars\/[^/]+\/primary$/],
  ["POST", /^\/api\/cars\/[^/]+\/photos$/],
  ["PATCH", /^\/api\/reservations\/[^/]+\/car$/],
  ["POST", /^\/api\/reservations\/[^/]+\/requests\/[^/]+\/acknowledge$/],
  ["PUT", /^\/api\/cars\/[^/]+\/photos$/],
  ["GET", /^\/api\/gallery\/mine\/media\/[^/]+$/],
  ["GET", /^\/api\/united-club\/members\/[^/]+$/],
  ["GET", /^\/api\/united-club\/members\/[^/]+\/media\/cars\/[^/]+$/],
  ["PUT", /^\/api\/live\/votes\/[^/]+$/],
  ["PUT", /^\/api\/live\/judge\/scores\/[^/]+$/],
  ["POST", /^\/api\/live\/judge\/entries\/[^/]+\/photos$/],
  ["GET", /^\/api\/live\/judge\/photos\/[^/]+$/],
  ["GET", /^\/api\/live\/entries\/[^/]+\/media$/],
];

export function isProtectedMemberRoute(method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (PROTECTED_MEMBER_EXACT_ROUTES.has(`${normalizedMethod} ${pathname}`)) return true;
  return PROTECTED_MEMBER_ROUTE_PATTERNS.some(([expectedMethod, pattern]) => expectedMethod === normalizedMethod && pattern.test(pathname));
}

export async function routeRequest({ request, env, url, origin }) {
  // Provider secret replaces Firebase only for this exact public POST route.
  if(url.pathname==='/api/mailing/smtp2go-webhook'&&request.method==='POST')return handleSmtp2goWebhook(request,env);
  if (url.pathname === "/api/health" && request.method === "GET") {
    const db = await env.DB.prepare("SELECT COUNT(*) AS count FROM events").first();
    return json({ ok: true, service: "e36-united-api", database: true, events: db?.count ?? 0, media: !!env.MEDIA, auth: "firebase" }, 200, origin);
  }

  // Public approved gallery feed.
  if (url.pathname === "/api/gallery/approved" && request.method === "GET") {
    return await domain.publicGalleryList(env, url, origin);
  }

  if (url.pathname === "/api/events/current" && request.method === "GET") {
    return await domain.getPublicCurrentEvent(env, origin);
  }

  const accommodationMediaMatch = url.pathname.match(/^\/api\/accommodation\/media\/([^/]+)$/);
  if (accommodationMediaMatch && request.method === "GET") {
    return await domain.publicAccommodationMedia(env, decodeURIComponent(accommodationMediaMatch[1]), url, origin);
  }
  const accommodationGalleryMediaMatch = url.pathname.match(/^\/api\/accommodation\/media\/([^/]+)\/([^/]+)$/);
  if (accommodationGalleryMediaMatch && request.method === "GET") {
    return await domain.publicAccommodationGalleryMedia(env, decodeURIComponent(accommodationGalleryMediaMatch[1]), decodeURIComponent(accommodationGalleryMediaMatch[2]), url, origin);
  }

  // Public media stream only for approved gallery submissions.
  if (url.pathname.startsWith("/api/gallery/media/") && request.method === "GET") {
    return await domain.publicGalleryMedia(env, decodeURIComponent(url.pathname.split("/").pop()), origin);
  }

  if (url.pathname.startsWith("/api/")) {
    if (!isAllowedOrigin(origin)) return json({ ok: false, error: "Origin not allowed" }, 403, origin);
    if (url.pathname === '/api/planner-handoffs' && request.method === 'POST') return trackPlannerHandoff(request,env,null,origin);

    const auth = await verifyFirebaseRequest(request);
    if (!auth) return json({ ok: false, authenticated: false, error: "Unauthorized" }, 401, origin);

    if (url.pathname.startsWith("/api/admin/")) {
      const admin = await requireAdmin(env, auth);
      if (!admin) {
        return json({ ok: false, error: "admin_forbidden", message: "Nemáš oprávnění pro United Admin" }, 403, origin);
      }

      if(url.pathname==='/api/admin/dashboard'&&request.method==='GET')return getAdminDashboard(env,url,origin);
      if(url.pathname==='/api/admin/live'&&request.method==='GET')return getAdminLive(env,url,origin);
      if(url.pathname==='/api/admin/events'&&request.method==='POST')return createEvent(request,env,auth,origin);
      const liveEnabled=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live$/);
      if(liveEnabled&&request.method==='PUT')return setAdminLiveEnabled(request,env,auth,decodeURIComponent(liveEnabled[1]),origin);
      const liveProgram=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/program(?:\/([^/]+))?$/);
      if(liveProgram&&['POST','PUT'].includes(request.method))return saveProgramItem(request,env,auth,decodeURIComponent(liveProgram[1]),liveProgram[2]?decodeURIComponent(liveProgram[2]):null,origin);
      if(liveProgram&&request.method==='DELETE'&&liveProgram[2])return deleteProgramItem(env,decodeURIComponent(liveProgram[1]),decodeURIComponent(liveProgram[2]),origin);
      const liveJudges=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/judges$/);
      if(liveJudges&&request.method==='PUT')return assignLiveJudge(request,env,auth,decodeURIComponent(liveJudges[1]),origin);
      const liveMembers=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/members$/);
      if(liveMembers&&request.method==='GET')return searchLiveMembers(env,decodeURIComponent(liveMembers[1]),url,origin);
      const liveQr=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/qr$/);
      if(liveQr&&request.method==='POST')return resolveLiveQr(request,env,decodeURIComponent(liveQr[1]),origin);
      const livePresence=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/members\/([^/]+)\/presence$/);
      if(livePresence&&request.method==='PUT')return setLivePresence(request,env,auth,decodeURIComponent(livePresence[1]),decodeURIComponent(livePresence[2]),origin);
      const liveEntries=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/entries$/);
      if(liveEntries&&request.method==='POST')return createLiveEntry(request,env,auth,decodeURIComponent(liveEntries[1]),origin);
      const liveStart=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/start$/);
      if(liveStart&&request.method==='POST')return startLiveEntry(request,env,auth,decodeURIComponent(liveStart[1]),origin);
      const liveControl=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/live\/(show_shine|best_exhaust)\/control$/);
      if(liveControl&&request.method==='PATCH')return controlLive(request,env,auth,decodeURIComponent(liveControl[1]),liveControl[2],origin);
      if(url.pathname==='/api/admin/preliminary-reservations'&&request.method==='GET')return listAdminPreliminaryReservations(env,url,origin);
      const preliminarySettings=url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/preliminary-settings$/);
      if(preliminarySettings&&request.method==='PUT')return savePreliminarySettings(request,env,auth,decodeURIComponent(preliminarySettings[1]),origin);
      if(url.pathname==='/api/admin/preferences'&&request.method==='GET')return getAdminPreferences(env,auth,origin);
      if(url.pathname==='/api/admin/preferences'&&request.method==='PUT')return saveAdminPreferences(request,env,auth,origin);
      if(url.pathname==='/api/admin/members'&&request.method==='GET')return listAdminMembers(env,url,origin);
      if(url.pathname==='/api/admin/member-qr/resolve'&&request.method==='POST')return resolveAdminMemberQr(request,env,origin);
      const memberMedia=url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/media\/(cars|history|photos)\/([^/]+)(?:\/([^/]+))?$/);
      if(memberMedia&&request.method==='GET')return adminMemberMedia(env,memberMedia[1],memberMedia[2],memberMedia[3],memberMedia[4]||memberMedia[3],origin);
      const memberDetail=url.pathname.match(/^\/api\/admin\/members\/([^/]+)(?:\/(reservations|garage|photos|history|points|club|mailing|qr))?$/);
      if(memberDetail&&request.method==='GET')return getAdminMember(env,url,memberDetail[1],memberDetail[2],origin);

      const mailingResponse = await routeAdminMailing({ request, env, url, auth, origin });
      if (mailingResponse) return mailingResponse;
      if (url.pathname === '/api/admin/funnel' && request.method === 'GET') return getAdminFunnel(env,url,origin);
      if (url.pathname === '/api/admin/attention' && request.method === 'GET') return json({history:await getAdminHistoryCounts(env)},200,origin);

      const operationMatch = url.pathname.match(/^\/api\/admin\/operations\/([a-z0-9_-]{1,128})$/i);
      if (operationMatch && request.method === 'GET') return getAdminOperation(env, auth, operationMatch[1], origin);
      if (url.pathname === '/api/admin/summary' && request.method === 'GET') return getAdminSummary(env, url, origin);

      if (url.pathname === "/api/admin/overview" && request.method === "GET") {
        return getAdminSummary(env, url, origin);
      }
      if (url.pathname === "/api/admin/reservations" && request.method === "GET") {
        return await domain.getAdminReservations({ ...env, ADMIN_READ: true }, url, origin);
      }
      if (url.pathname === "/api/admin/events" && request.method === "GET") {
        return await domain.getAdminEvents({ ...env, ADMIN_READ: true }, origin);
      }
      if (url.pathname === "/api/admin/accommodation" && request.method === "GET") {
        return await domain.getAdminAccommodation({ ...env, ADMIN_READ: true }, url, origin);
      }
      if (url.pathname === "/api/admin/accommodation" && request.method === "POST") {
        let commandBody; try { commandBody = await request.clone().json(); } catch { return json({error:'invalid_json'},400,origin); }
        return runAdminCommand(request, env, auth, 'accommodation-create', commandBody?.eventId, origin, commandEnv => domain.createAdminAccommodation(request, commandEnv, auth, origin));
      }
      if (url.pathname === "/api/admin/gallery" && request.method === "GET") {
        return await domain.getAdminGallery({ ...env, ADMIN_READ: true }, origin, url);
      }
      if (url.pathname === "/api/admin/history/claims" && request.method === "GET") {
        return await domain.getAdminHistoryClaims({ ...env, ADMIN_READ: true }, url, origin);
      }

      const adminHistoryEvidenceMatch = url.pathname.match(/^\/api\/admin\/history\/evidence\/([^/]+)$/);
      if (adminHistoryEvidenceMatch && request.method === "GET") {
        return await domain.historyEvidenceMedia(env, decodeURIComponent(adminHistoryEvidenceMatch[1]), null, origin);
      }

      const adminHistoryReviewMatch = url.pathname.match(/^\/api\/admin\/history\/claims\/([^/]+)\/(attendance|sns)$/);
      if (adminHistoryReviewMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminHistoryReviewMatch[1]);
        const component = adminHistoryReviewMatch[2];
        return runAdminCommand(request, env, auth, 'history-' + component, entityId, origin,
          commandEnv => domain.patchAdminHistoryClaim(request, commandEnv, auth, entityId, component, origin));
      }

      const adminGalleryMediaMatch = url.pathname.match(/^\/api\/admin\/gallery\/media\/([^/]+)$/);
      if (adminGalleryMediaMatch && request.method === "GET") {
        return await domain.adminGalleryMedia(env, decodeURIComponent(adminGalleryMediaMatch[1]), origin);
      }

      const adminGalleryMatch = url.pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/);
      if (adminGalleryMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminGalleryMatch[1]);
        return runAdminCommand(request, env, auth, 'gallery', entityId, origin, commandEnv => domain.patchAdminGallery(request, commandEnv, auth, entityId, origin));
      }

      const adminReservationPaymentMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)\/payment$/);
      if (adminReservationPaymentMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminReservationPaymentMatch[1]);
        return runAdminCommand(request, env, auth, 'payment', entityId, origin, commandEnv => domain.patchAdminReservationPayment(request, commandEnv, auth, entityId, origin));
      }

      const adminReservationRequestMatch=url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)\/requests\/([^/]+)$/);
      if(adminReservationRequestMatch&&request.method==='PATCH'){
        const reservationId=decodeURIComponent(adminReservationRequestMatch[1]),requestId=decodeURIComponent(adminReservationRequestMatch[2]);
        return runAdminCommand(request,env,auth,'reservation-request',reservationId,origin,commandEnv=>domain.reviewReservationRequest(request,commandEnv,auth,reservationId,requestId,origin));
      }

      const adminReservationMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/);
      if (adminReservationMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminReservationMatch[1]);
        return runAdminCommand(request, env, auth, 'reservation', entityId, origin, commandEnv => domain.patchAdminReservation(request, commandEnv, auth, entityId, origin));
      }

      const adminEventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/);
      if (adminEventMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminEventMatch[1]);
        return runAdminCommand(request, env, auth, 'event', entityId, origin, commandEnv => domain.patchAdminEvent(request, commandEnv, auth, entityId, origin));
      }

      const adminAccommodationMatch = url.pathname.match(/^\/api\/admin\/accommodation\/([^/]+)$/);
      if (adminAccommodationMatch && request.method === "PATCH") {
        const entityId = decodeURIComponent(adminAccommodationMatch[1]);
        return runAdminCommand(request, env, auth, 'accommodation', entityId, origin, commandEnv => domain.patchAdminAccommodation(request, commandEnv, auth, entityId, origin));
      }

      const adminAccommodationPhotoMatch = url.pathname.match(/^\/api\/admin\/accommodation\/([^/]+)\/photo$/);
      if (adminAccommodationPhotoMatch && request.method === "PUT") {
        return await domain.putAdminAccommodationPhoto(request, env, auth, decodeURIComponent(adminAccommodationPhotoMatch[1]), origin);
      }
      if (adminAccommodationPhotoMatch && request.method === "DELETE") {
        return await domain.deleteAdminAccommodationPhoto(env, auth, decodeURIComponent(adminAccommodationPhotoMatch[1]), origin);
      }
      const adminAccommodationGalleryMatch = url.pathname.match(/^\/api\/admin\/accommodation\/([^/]+)\/photos(?:\/([^/]+))?$/);
      if (adminAccommodationGalleryMatch && request.method === "POST" && !adminAccommodationGalleryMatch[2]) {
        return await domain.postAdminAccommodationGalleryPhoto(request, env, auth, decodeURIComponent(adminAccommodationGalleryMatch[1]), origin);
      }
      if (adminAccommodationGalleryMatch && request.method === "DELETE" && adminAccommodationGalleryMatch[2]) {
        return await domain.deleteAdminAccommodationGalleryPhoto(env, auth, decodeURIComponent(adminAccommodationGalleryMatch[1]), decodeURIComponent(adminAccommodationGalleryMatch[2]), origin);
      }
      if (adminAccommodationGalleryMatch && request.method === "PATCH" && adminAccommodationGalleryMatch[2]) {
        return await domain.patchAdminAccommodationGalleryPhoto(request, env, auth, decodeURIComponent(adminAccommodationGalleryMatch[1]), decodeURIComponent(adminAccommodationGalleryMatch[2]), origin);
      }

      return json({ ok: false, error: "not_found", message: "Admin endpoint neexistuje." }, 404, origin);
    }

    if (url.pathname === "/api/bootstrap" && request.method === "POST") {
      const member = await findMemberAuthorizationRecord(env, auth);
      if (member && member.status !== ACTIVE_MEMBER_STATUS) return activeMemberForbidden(origin);
      auth.member = member;
      return await domain.bootstrapMember(request, env, auth, origin);
    }
    if (url.pathname === "/api/me" && request.method === "GET") return await domain.getMember(env, auth, origin);
    if (url.pathname === '/api/onboarding' && request.method === 'POST') return trackOnboarding(request,env,auth,origin);

    if (isProtectedMemberRoute(request.method, url.pathname)) {
      const member = await requireActiveMember(env, auth);
      if (!member) return activeMemberForbidden(origin);
      auth.member = member;
    }

    if(url.pathname==='/api/preliminary-reservations/current'){
      if(request.method==='GET')return getPreliminaryReservation(env,auth,origin);
      if(request.method==='PUT')return putPreliminaryReservation(request,env,auth,origin);
      if(request.method==='DELETE')return cancelPreliminaryReservation(request,env,auth,origin);
    }
    if(url.pathname==='/api/live'&&request.method==='GET')return getMemberLive(env,auth,origin);
    if(url.pathname==='/api/live/state'&&request.method==='GET')return getLiveState(env,auth,url,origin);
    if(url.pathname==='/api/live/photos'&&request.method==='POST')return uploadLivePhoto(request,env,auth,origin);
    const liveVote=url.pathname.match(/^\/api\/live\/votes\/([^/]+)$/);
    if(liveVote&&request.method==='PUT')return saveLiveVote(request,env,auth,decodeURIComponent(liveVote[1]),origin);
    const liveJudgeScore=url.pathname.match(/^\/api\/live\/judge\/scores\/([^/]+)$/);
    if(liveJudgeScore&&request.method==='PUT')return saveJudgeScore(request,env,auth,decodeURIComponent(liveJudgeScore[1]),origin);
    const liveJudgeUpload=url.pathname.match(/^\/api\/live\/judge\/entries\/([^/]+)\/photos$/);
    if(liveJudgeUpload&&request.method==='POST')return uploadJudgePhoto(request,env,auth,decodeURIComponent(liveJudgeUpload[1]),origin);
    const liveJudgeMedia=url.pathname.match(/^\/api\/live\/judge\/photos\/([^/]+)$/);
    if(liveJudgeMedia&&request.method==='GET')return judgePhotoMedia(env,auth,decodeURIComponent(liveJudgeMedia[1]),origin);
    const liveEntryPhoto=url.pathname.match(/^\/api\/live\/entries\/([^/]+)\/media$/);
    if(liveEntryPhoto&&request.method==='GET')return liveEntryMedia(env,auth,decodeURIComponent(liveEntryPhoto[1]),origin);
    if (url.pathname === "/api/navigation-state" && request.method === "GET") return await domain.getMemberNavigationState(env, auth, origin);
    if (url.pathname === '/api/planner-handoffs/claim' && request.method === 'POST') return trackPlannerHandoff(request,env,auth,origin);
    if (url.pathname === "/api/united-club" && request.method === "GET") return await domain.getUnitedClub(env, auth, origin);
    if (url.pathname === '/api/united-club/gallery-links' && request.method === 'GET') return await domain.getClubGalleryLinks(env, url, origin);
    const clubMemberMediaMatch = url.pathname.match(/^\/api\/united-club\/members\/([^/]+)\/media\/cars\/([^/]+)$/);
    if (clubMemberMediaMatch && request.method === 'GET') return await domain.clubMemberCarMedia(env, auth,
      decodeURIComponent(clubMemberMediaMatch[1]), decodeURIComponent(clubMemberMediaMatch[2]), origin);
    const clubMemberProfileMatch = url.pathname.match(/^\/api\/united-club\/members\/([^/]+)$/);
    if (clubMemberProfileMatch && request.method === 'GET') return await domain.getClubMemberProfile(env, auth, decodeURIComponent(clubMemberProfileMatch[1]), origin);
    if (url.pathname === "/api/history/claims" && request.method === "POST") return await domain.submitHistoryClaim(request, env, auth, origin);
    if (url.pathname === "/api/history/completed" && request.method === "POST") return await domain.completeMemberHistory(env, auth, origin);
    const memberHistoryEvidenceMatch = url.pathname.match(/^\/api\/history\/evidence\/([^/]+)$/);
    if (memberHistoryEvidenceMatch && request.method === "GET") {
      return await domain.historyEvidenceMedia(env, decodeURIComponent(memberHistoryEvidenceMatch[1]), auth.uid, origin);
    }
    if (url.pathname === "/api/planner-draft" && request.method === "GET") return await domain.getPlannerDraft(env, auth, origin);
    if (url.pathname === "/api/planner-draft" && request.method === "PUT") return await domain.putPlannerDraft(request, env, auth, origin);
    if (url.pathname === "/api/planner-draft" && request.method === "DELETE") return await domain.deletePlannerDraft(env, auth, url, origin);

    if (url.pathname === "/api/reservations/current" && request.method === "GET") return await domain.getCurrentReservation(env, auth, origin);
    if (url.pathname === "/api/reservations/current" && request.method === "PUT") return await domain.putCurrentReservation(request, env, auth, origin);
    if (url.pathname === "/api/reservations/current/requests" && request.method === "POST") {
      let body;try{body=await request.clone().json()}catch{return json({ok:false,error:'invalid_json',message:'Požadavek nemá platný JSON.'},400,origin)}
      return domain.submitReservationRequest(request,env,auth,body?.reservationId,origin);
    }
    const reservationCarMatch=url.pathname.match(/^\/api\/reservations\/([^/]+)\/car$/);
    if(reservationCarMatch&&request.method==='PATCH')return domain.updateReservationCar(request,env,auth,decodeURIComponent(reservationCarMatch[1]),origin);
    const reservationRequestAcknowledgementMatch=url.pathname.match(/^\/api\/reservations\/([^/]+)\/requests\/([^/]+)\/acknowledge$/);
    if(reservationRequestAcknowledgementMatch&&request.method==='POST')return domain.acknowledgeReservationRequest(env,auth,
      decodeURIComponent(reservationRequestAcknowledgementMatch[1]),decodeURIComponent(reservationRequestAcknowledgementMatch[2]),origin);

    if (url.pathname === "/api/cars" && request.method === "GET") return await domain.listCars(env, auth, origin);
    if (url.pathname === "/api/cars" && request.method === "POST") return await domain.createCar(request, env, auth, origin);

    if (url.pathname.startsWith("/api/cars/media/") && request.method === "GET") {
      return await domain.privateCarMedia(env, auth, decodeURIComponent(url.pathname.split("/").pop()), origin);
    }

    const carMatch = url.pathname.match(/^\/api\/cars\/([^/]+)$/);
    if (carMatch && request.method === "PUT") return await domain.updateCar(request, env, auth, decodeURIComponent(carMatch[1]), origin);
    if (carMatch && request.method === "DELETE") return await domain.deleteCar(env, auth, decodeURIComponent(carMatch[1]), origin);

    const primaryMatch = url.pathname.match(/^\/api\/cars\/([^/]+)\/primary$/);
    if (primaryMatch && request.method === "POST") return await domain.setPrimaryCar(env, auth, decodeURIComponent(primaryMatch[1]), origin);

    const photoMatch = url.pathname.match(/^\/api\/cars\/([^/]+)\/photos$/);
    if (photoMatch && request.method === "POST") return await domain.uploadCarPhoto(request, env, auth, decodeURIComponent(photoMatch[1]), origin);
    if (photoMatch && request.method === "PUT") return await domain.replaceCarPhoto(request, env, auth, decodeURIComponent(photoMatch[1]), origin);

    if (url.pathname === "/api/gallery/submissions" && request.method === "POST") return await domain.uploadGallerySubmission(request, env, auth, origin);
    if (url.pathname === "/api/gallery/mine" && request.method === "GET") return await domain.listMyGallery(env, auth, url, origin);
    const memberGalleryMediaMatch = url.pathname.match(/^\/api\/gallery\/mine\/media\/([^/]+)$/);
    if (memberGalleryMediaMatch && request.method === "GET") return await domain.privateMemberGalleryMedia(env, auth, decodeURIComponent(memberGalleryMediaMatch[1]), origin);
  }

  return json({ ok: true, service: "E36 United API" }, 200, origin);
}
