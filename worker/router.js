import { requireAdmin } from "./auth/admin.js";
import { verifyFirebaseRequest } from "./auth/firebase.js";
import * as domain from "./domains.js";
import { isAllowedOrigin } from "./http/cors.js";
import { json } from "./http/responses.js";

export async function routeRequest({ request, env, url, origin }) {
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

  // Public media stream only for approved gallery submissions.
  if (url.pathname.startsWith("/api/gallery/media/") && request.method === "GET") {
    return await domain.publicGalleryMedia(env, decodeURIComponent(url.pathname.split("/").pop()), origin);
  }

  if (url.pathname.startsWith("/api/")) {
    if (!isAllowedOrigin(origin)) return json({ ok: false, error: "Origin not allowed" }, 403, origin);

    const auth = await verifyFirebaseRequest(request);
    if (!auth) return json({ ok: false, authenticated: false, error: "Unauthorized" }, 401, origin);

    if (url.pathname.startsWith("/api/admin/")) {
      const admin = await requireAdmin(env, auth);
      if (!admin) {
        return json({ ok: false, error: "admin_forbidden", message: "Nemáš oprávnění pro United Admin" }, 403, origin);
      }

      if (url.pathname === "/api/admin/overview" && request.method === "GET") {
        return await domain.getAdminOverview(env, url, origin);
      }
      if (url.pathname === "/api/admin/reservations" && request.method === "GET") {
        return await domain.getAdminReservations(env, url, origin);
      }
      if (url.pathname === "/api/admin/events" && request.method === "GET") {
        return await domain.getAdminEvents(env, origin);
      }
      if (url.pathname === "/api/admin/accommodation" && request.method === "GET") {
        return await domain.getAdminAccommodation(env, url, origin);
      }
      if (url.pathname === "/api/admin/accommodation" && request.method === "POST") {
        return await domain.createAdminAccommodation(request, env, auth, origin);
      }
      if (url.pathname === "/api/admin/gallery" && request.method === "GET") {
        return await domain.getAdminGallery(env, origin);
      }
      if (url.pathname === "/api/admin/history/claims" && request.method === "GET") {
        return await domain.getAdminHistoryClaims(env, url, origin);
      }

      const adminHistoryEvidenceMatch = url.pathname.match(/^\/api\/admin\/history\/evidence\/([^/]+)$/);
      if (adminHistoryEvidenceMatch && request.method === "GET") {
        return await domain.historyEvidenceMedia(env, decodeURIComponent(adminHistoryEvidenceMatch[1]), null, origin);
      }

      const adminHistoryReviewMatch = url.pathname.match(/^\/api\/admin\/history\/claims\/([^/]+)\/(attendance|sns)$/);
      if (adminHistoryReviewMatch && request.method === "PATCH") {
        return await domain.patchAdminHistoryClaim(
          request,
          env,
          auth,
          decodeURIComponent(adminHistoryReviewMatch[1]),
          adminHistoryReviewMatch[2],
          origin,
        );
      }

      const adminGalleryMediaMatch = url.pathname.match(/^\/api\/admin\/gallery\/media\/([^/]+)$/);
      if (adminGalleryMediaMatch && request.method === "GET") {
        return await domain.adminGalleryMedia(env, decodeURIComponent(adminGalleryMediaMatch[1]), origin);
      }

      const adminGalleryMatch = url.pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/);
      if (adminGalleryMatch && request.method === "PATCH") {
        return await domain.patchAdminGallery(request, env, auth, decodeURIComponent(adminGalleryMatch[1]), origin);
      }

      const adminReservationPaymentMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)\/payment$/);
      if (adminReservationPaymentMatch && request.method === "PATCH") {
        return await domain.patchAdminReservationPayment(request, env, auth, decodeURIComponent(adminReservationPaymentMatch[1]), origin);
      }

      const adminReservationMatch = url.pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/);
      if (adminReservationMatch && request.method === "PATCH") {
        return await domain.patchAdminReservation(request, env, auth, decodeURIComponent(adminReservationMatch[1]), origin);
      }

      const adminEventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/);
      if (adminEventMatch && request.method === "PATCH") {
        return await domain.patchAdminEvent(request, env, auth, decodeURIComponent(adminEventMatch[1]), origin);
      }

      const adminAccommodationMatch = url.pathname.match(/^\/api\/admin\/accommodation\/([^/]+)$/);
      if (adminAccommodationMatch && request.method === "PATCH") {
        return await domain.patchAdminAccommodation(request, env, auth, decodeURIComponent(adminAccommodationMatch[1]), origin);
      }

      const adminAccommodationPhotoMatch = url.pathname.match(/^\/api\/admin\/accommodation\/([^/]+)\/photo$/);
      if (adminAccommodationPhotoMatch && request.method === "PUT") {
        return await domain.putAdminAccommodationPhoto(request, env, auth, decodeURIComponent(adminAccommodationPhotoMatch[1]), origin);
      }
      if (adminAccommodationPhotoMatch && request.method === "DELETE") {
        return await domain.deleteAdminAccommodationPhoto(env, auth, decodeURIComponent(adminAccommodationPhotoMatch[1]), origin);
      }

      return json({ ok: false, error: "not_found", message: "Admin endpoint neexistuje." }, 404, origin);
    }

    if (url.pathname === "/api/bootstrap" && request.method === "POST") return await domain.bootstrapMember(request, env, auth, origin);
    if (url.pathname === "/api/me" && request.method === "GET") return await domain.getMember(env, auth, origin);

    if (url.pathname === "/api/navigation-state" && request.method === "GET") return await domain.getMemberNavigationState(env, auth, origin);
    if (url.pathname === "/api/united-club" && request.method === "GET") return await domain.getUnitedClub(env, auth, origin);
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
