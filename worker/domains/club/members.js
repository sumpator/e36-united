import { cors } from '../../http/cors.js';
import { json } from '../../http/responses.js';
import { deriveMemberRating, deriveUnitedAchievements } from './achievements.js';

const CLUB_MEMBER_PAGE_SIZE = 24;
const CLUB_GALLERY_LINK_LIMIT = 72;

function profileRef(value) {
  const normalized = String(value || '').trim();
  return /^[A-Z0-9-]{3,64}$/i.test(normalized) ? normalized : '';
}

function clubMemberMediaUrl(memberCode, photoId) {
  return `/api/united-club/members/${encodeURIComponent(memberCode)}/media/cars/${encodeURIComponent(photoId)}`;
}

async function listClubMembers(env, auth, { limit = CLUB_MEMBER_PAGE_SIZE, offset = 0 } = {}) {
  const boundedLimit = Math.max(1, Math.min(CLUB_MEMBER_PAGE_SIZE, Number(limit) || CLUB_MEMBER_PAGE_SIZE));
  const boundedOffset = Math.max(0, Math.min(10000, Number(offset) || 0));
  const rows = await env.DB.prepare(`
    WITH selected_members AS (
      SELECT id, member_code, name, nickname, created_at
      FROM members
      WHERE status = 'active' AND hide_on_club = 0
      ORDER BY created_at DESC, id
      LIMIT ? OFFSET ?
    ), approved_attendance AS (
      SELECT c.member_id, MIN(e.year) AS member_since, COUNT(*) AS attendance_count
      FROM united_history_claims c
      JOIN events e ON e.id = c.event_id
      WHERE c.attendance_status = 'approved'
        AND c.member_id IN (SELECT id FROM selected_members)
      GROUP BY c.member_id
    ), ranked_cars AS (
      SELECT c.id, c.member_id,
        ROW_NUMBER() OVER (PARTITION BY c.member_id ORDER BY c.is_primary DESC, c.created_at ASC, c.id) AS car_rank
      FROM cars c
      WHERE c.member_id IN (SELECT id FROM selected_members)
    ), ranked_photos AS (
      SELECT p.id, c.member_id,
        ROW_NUMBER() OVER (PARTITION BY c.member_id ORDER BY p.sort_order ASC, p.created_at ASC, p.id) AS photo_rank
      FROM car_photos p
      JOIN ranked_cars c ON c.id = p.car_id AND c.car_rank = 1
    )
    SELECT m.member_code, m.name, m.nickname, m.created_at,
      a.member_since, COALESCE(a.attendance_count, 0) AS attendance_count,
      p.id AS photo_id
    FROM selected_members m
    LEFT JOIN approved_attendance a ON a.member_id = m.id
    LEFT JOIN ranked_photos p ON p.member_id = m.id AND p.photo_rank = 1
    ORDER BY m.created_at DESC, m.id
  `).bind(boundedLimit + 1, boundedOffset).all();
  const found = rows.results || [];
  const page = found.slice(0, boundedLimit);
  return {
    members: page.map(row => ({
      profileRef: row.member_code,
      name: row.name || '',
      nickname: row.nickname || row.name || 'United member',
      memberSince: row.member_since || String(row.created_at || '').slice(0, 4) || null,
      attendanceCount: Number(row.attendance_count || 0),
      photoId: row.photo_id || null,
      photoUrl: row.photo_id ? clubMemberMediaUrl(row.member_code, row.photo_id) : null,
      ownProfile: row.member_code === auth.member?.member_code,
    })),
    pagination: {
      limit: boundedLimit,
      offset: boundedOffset,
      nextOffset: boundedOffset + page.length,
      hasMore: found.length > boundedLimit,
    },
  };
}

async function getClubMemberProfile(env, auth, memberCode, origin) {
  const ref = profileRef(memberCode);
  if (!ref) return json({ ok: false, error: 'club_profile_not_found' }, 404, origin);
  const member = await env.DB.prepare(`
    SELECT id, member_code, name, nickname, created_at
    FROM members
    WHERE member_code = ? AND status = 'active'
      AND (hide_on_club = 0 OR id = ?)
    LIMIT 1
  `).bind(ref, auth.uid).first();
  if (!member) return json({ ok: false, error: 'club_profile_not_found' }, 404, origin);

  const [historyResult, pointsResult, carsResult, galleryResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT e.year AS event_year,
        c.sns_status, c.sns_category, c.sns_placement, c.sns_best_of_best, c.sns_best_exhaust
      FROM united_history_claims c
      JOIN events e ON e.id = c.event_id
      WHERE c.member_id = ? AND c.attendance_status = 'approved'
      ORDER BY e.year DESC
      LIMIT 24
    `).bind(member.id),
    env.DB.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS available,
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS lifetime
      FROM united_points_ledger
      WHERE member_id = ?
    `).bind(member.id),
    env.DB.prepare(`
      SELECT c.id, c.nickname, c.model, c.body, c.year, c.color, c.is_primary,
        p.id AS photo_id, p.sort_order AS photo_sort
      FROM cars c
      LEFT JOIN car_photos p ON p.car_id = c.id
      WHERE c.member_id = ?
      ORDER BY c.is_primary DESC, c.created_at ASC, p.sort_order ASC, p.created_at ASC
      LIMIT 36
    `).bind(member.id),
    env.DB.prepare(`
      SELECT id, caption, created_at, COUNT(*) OVER () AS total_count
      FROM gallery_submissions
      WHERE member_id = ? AND status = 'approved'
      ORDER BY COALESCE(reviewed_at, created_at) DESC, id DESC
      LIMIT 24
    `).bind(member.id),
  ]);

  const history = (historyResult.results || []).map(row => ({
    eventYear: Number(row.event_year || 0),
    showShine: row.sns_status === 'approved' ? {
      category: row.sns_category || '',
      placement: row.sns_placement ? Number(row.sns_placement) : null,
      bestOfBest: !!row.sns_best_of_best,
      bestExhaust: !!row.sns_best_exhaust,
    } : null,
  }));
  const pointRow = pointsResult.results?.[0] || {};
  const available = Number(pointRow.available || 0);
  const lifetime = Number(pointRow.lifetime || 0);
  const gallery = (galleryResult.results || []).map(row => ({
    id: row.id,
    caption: row.caption || '',
    createdAt: row.created_at,
    imageUrl: `/api/gallery/media/${encodeURIComponent(row.id)}`,
  }));
  const approvedPhotoCount = Number(galleryResult.results?.[0]?.total_count || 0);
  const derived = deriveUnitedAchievements(history.map(item => ({
    eventYear: item.eventYear,
    attendance: { status: 'approved' },
    showShine: item.showShine ? { status: 'approved', ...item.showShine } : { status: 'not_claimed' },
  })), approvedPhotoCount);
  const cars = new Map();
  for (const row of carsResult.results || []) {
    if (!cars.has(row.id)) cars.set(row.id, {
      id: row.id,
      nickname: row.nickname || '',
      model: row.model || '',
      body: row.body || '',
      year: row.year || '',
      color: row.color || '',
      primary: !!row.is_primary,
      photos: [],
    });
    if (row.photo_id) cars.get(row.id).photos.push({
      id: row.photo_id,
      imageUrl: clubMemberMediaUrl(member.member_code, row.photo_id),
    });
  }
  return json({
    ok: true,
    profile: {
      profileRef: member.member_code,
      name: member.name || '',
      nickname: member.nickname || member.name || 'United member',
      memberSince: history.length ? Math.min(...history.map(item => item.eventYear)) : String(member.created_at || '').slice(0, 4) || null,
      attendanceCount: history.length,
      points: { available, lifetime },
      rating: deriveMemberRating(lifetime),
      achievements: derived.achievements,
      history,
      cars: [...cars.values()],
      gallery,
      approvedPhotoCount,
      ownProfile: member.id === auth.uid,
    },
  }, 200, origin);
}

async function getClubGalleryLinks(env, url, origin) {
  const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').map(value => value.trim()).filter(value => /^[a-z0-9-]{1,128}$/i.test(value)))].slice(0, CLUB_GALLERY_LINK_LIMIT);
  if (!ids.length) return json({ ok: true, links: {} }, 200, origin);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT g.id, m.member_code
    FROM gallery_submissions g
    JOIN members m ON m.id = g.member_id
    WHERE g.id IN (${placeholders}) AND g.status = 'approved'
      AND m.status = 'active' AND m.hide_on_club = 0
    LIMIT ${CLUB_GALLERY_LINK_LIMIT}
  `).bind(...ids).all();
  return json({ ok: true, links: Object.fromEntries((rows.results || []).map(row => [row.id, row.member_code])) }, 200, origin);
}

async function clubMemberCarMedia(env, auth, memberCode, photoId, origin) {
  const ref = profileRef(memberCode);
  if (!ref) return json({ ok: false, error: 'Photo not found' }, 404, origin);
  const row = await env.DB.prepare(`
    SELECT p.r2_key, p.mime_type
    FROM members m
    JOIN cars c ON c.member_id = m.id
    JOIN car_photos p ON p.car_id = c.id
    WHERE m.member_code = ? AND p.id = ? AND m.status = 'active'
      AND (m.hide_on_club = 0 OR m.id = ?)
    LIMIT 1
  `).bind(ref, photoId, auth.uid).first();
  if (!row) return json({ ok: false, error: 'Photo not found' }, 404, origin);
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return json({ ok: false, error: 'Media not found' }, 404, origin);
  const headers = new Headers({ 'Content-Type': row.mime_type || 'image/jpeg', 'Cache-Control': 'private, no-store' });
  return cors(new Response(object.body, { status: 200, headers }), origin);
}

export {
  CLUB_GALLERY_LINK_LIMIT,
  CLUB_MEMBER_PAGE_SIZE,
  clubMemberCarMedia,
  getClubGalleryLinks,
  getClubMemberProfile,
  listClubMembers,
};
