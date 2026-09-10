import { ADMIN_VIEW_IDS, RESERVATION_VIEW_MODES } from '../admin-view-model.js?v=20260910-admin-private-media-r6';
import { readSessionChoice, readSessionValue, readSessionYear } from './ui.js?v=20260910-admin-private-media-r6';

export const adminState={
  currentUser:null,
  sessionGeneration:0,
  denied:false,
  summary:null,
  dashboardAnalytics:null,dashboardMailing:null,dashboardPreferences:null,dashboardPreferenceRevision:0,
  dashboardComposition:'preparation',dashboardRange:'all',dashboardDrill:{},
  resourceStates:{},
  loading:false,
  events:[],
  selectedEventId:'',
  accommodationItems:[],
  reservationItems:[],
  reservationPagination:null,reservationCounts:null,reservationPage:1,reservationDetail:null,
  galleryPagination:null,galleryCounts:null,galleryPage:1,
  reservationFilter:'all',
  reservationDetailFilters:new Set(),
  reservationFiltersOpen:false,
  reservationSearch:'',
  reservationViewMode:readSessionChoice('e36UnitedAdmin.reservationViewMode',RESERVATION_VIEW_MODES,'quick'),
  paymentFilter:'attention',
  paymentSearch:'',
  activeAdminView:readSessionChoice('e36UnitedAdmin.activeView',ADMIN_VIEW_IDS,'dashboard'),
  selectedReservationId:null,
  galleryItems:[],
  galleryFilter:'pending',
  galleryMode:'community',
  historyClaims:[],
  historyFilter:readSessionChoice('e36UnitedAdmin.historyStatus',['pending','approved','rejected','all'],'pending'),
  historyYear:readSessionYear('e36UnitedAdmin.historyYear'),
  historyClaimType:readSessionChoice('e36UnitedAdmin.historyType',['all','attendance','show_shine','best_of_best','best_exhaust'],'all'),
  historySearch:readSessionValue('e36UnitedAdmin.historySearch',''),
  historyCounts:{attendancePending:0,snsPending:0,pending:0,approved:0,rejected:0,total:0,latestPendingYear:null,latestYear:null,latestYearPending:0,olderPending:0},
  historyYears:[],
  historyPagination:{page:1,pageSize:24,total:0,totalPages:1},
};

export function resetAdminDomainState(){
  adminState.summary=null;
  adminState.dashboardMailing=null;
  adminState.dashboardAnalytics=null;adminState.dashboardPreferences=null;adminState.dashboardPreferenceRevision=0;adminState.dashboardDrill={};adminState.dashboardComposition='preparation';adminState.dashboardRange='all';
  adminState.reservationPagination=null;adminState.reservationCounts=null;adminState.reservationPage=1;adminState.reservationDetail=null;adminState.galleryPage=1;adminState.galleryPagination=null;adminState.galleryCounts=null;
  adminState.resourceStates={};
  adminState.selectedReservationId=null;
  adminState.historyCounts={};
  adminState.galleryItems=[];
  adminState.historyClaims=[];
  adminState.reservationItems=[];
  adminState.accommodationItems=[];
  adminState.events=[];
  adminState.selectedEventId='';
}

export function resetAdminFiltersForLogin(){
  // Safe route-provided drill-downs are restored by navigation after authentication.
  adminState.reservationFilter='all';
  adminState.reservationDetailFilters.clear();
  adminState.reservationFiltersOpen=false;
  adminState.galleryFilter='pending';
  // The allowlisted initial / Back route owns galleryMode; login must not turn
  // a historic Club/history deep link into the community-photo queue.
  adminState.paymentFilter='attention';
}

export function resetAdminFiltersForEvent(){
  adminState.dashboardDrill={};
  adminState.reservationPage=1;adminState.reservationPagination=null;adminState.reservationDetail=null;
  adminState.reservationFilter='all';
  adminState.reservationDetailFilters.clear();
  adminState.reservationFiltersOpen=false;
  adminState.reservationSearch='';
  adminState.paymentFilter='attention';
  adminState.paymentSearch='';
}
