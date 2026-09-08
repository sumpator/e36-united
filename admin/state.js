import { ADMIN_VIEW_IDS, RESERVATION_VIEW_MODES } from '../admin-view-model.js?v=20260908-admin-safe1';
import { readSessionChoice, readSessionValue, readSessionYear } from './ui.js?v=20260908-admin-safe1';

export const adminState={
  currentUser:null,
  sessionGeneration:0,
  denied:false,
  summary:null,
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
  adminState.reservationFilter='all';
  adminState.reservationDetailFilters.clear();
  adminState.reservationFiltersOpen=false;
  adminState.galleryFilter='pending';
  adminState.galleryMode='community';
  adminState.paymentFilter='attention';
}

export function resetAdminFiltersForEvent(){
  adminState.reservationPage=1;adminState.reservationPagination=null;adminState.reservationDetail=null;
  adminState.reservationFilter='all';
  adminState.reservationDetailFilters.clear();
  adminState.reservationFiltersOpen=false;
  adminState.reservationSearch='';
  adminState.paymentFilter='attention';
  adminState.paymentSearch='';
}
