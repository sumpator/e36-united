import { createMemberHistory } from './history.js?v=20260903-phase4d';
import { createMemberPoints } from './points.js?v=20260911-readability-r1';
import { createClubMembers } from './members.js?v=20260913-club-profile-ux-r1';

export function createMemberClub({
  apiBaseUrl,
  apiRequest,
  apiRequestForm,
  apiRequestBlob,
  getCurrentUser,
  getData,
  setClub,
  createDefaultClub,
  renderOverviewPoints,
  renderFeaturedAchievements,
  renderAll,
  formatApiError,
  openSection,
}){
  async function loadUnitedClub(){
    const payload=await apiRequest('/api/united-club');
    if(!payload?.ok)throw new Error('united_club_invalid');
    const defaults=createDefaultClub();
    return {
      ...defaults,
      ...payload,
      points:{...defaults.points,...(payload.points||{})},
      rating:{...defaults.rating,...(payload.rating||{})},
      history:Array.isArray(payload.history)?payload.history:[],
      achievements:Array.isArray(payload.achievements)?payload.achievements:[],
      featuredAchievements:Array.isArray(payload.featuredAchievements)?payload.featuredAchievements.slice(0,4):[],
      clubMembers:{...defaults.clubMembers,...(payload.clubMembers||{}),members:Array.isArray(payload.clubMembers?.members)?payload.clubMembers.members:[]},
    };
  }
  async function refreshClub(){const club=await loadUnitedClub();setClub(club);return club}

  const memberPoints=createMemberPoints({getData,renderOverviewPoints,renderFeaturedAchievements});
  const memberHistory=createMemberHistory({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser,getData,refreshClub,renderAll,formatApiError});
  const clubMembers=createClubMembers({apiBaseUrl,apiRequest,apiRequestBlob,getData,openSection});

  function bind(){memberPoints.bind();memberHistory.bind();clubMembers.bind()}

  return {
    bind,
    getAttended:memberPoints.attended,
    getLifetimePoints:memberPoints.lifetimePoints,
    getMemberSince:memberPoints.memberSince,
    getPoints:memberPoints.points,
    getVerified:memberPoints.verified,
    load:loadUnitedClub,
    refresh:refreshClub,
    renderAchievements:memberPoints.renderAchievements,
    renderHistory:memberHistory.renderHistory,
    renderPoints:memberPoints.renderPoints,
    renderRewards:memberPoints.renderRewards,
    renderMembers:clubMembers.render,
    reset(){memberHistory.reset();clubMembers.reset()},
  };
}
