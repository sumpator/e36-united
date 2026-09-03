import { ADMIN_VIEW_IDS, RESERVATION_VIEW_MODES } from '../admin-view-model.js?v=20260903-mailing-a';
import { readSessionChoice, readSessionValue, readSessionYear } from './ui.js?v=20260903-phase5';

export const adminState={
  currentUser:null,
  loading:false,
  events:[],
  selectedEventId:'',
  accommodationItems:[],
  reservationItems:[],
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
  adminState.reservationFilter='all';
  adminState.reservationDetailFilters.clear();
  adminState.reservationFiltersOpen=false;
  adminState.reservationSearch='';
  adminState.paymentFilter='attention';
  adminState.paymentSearch='';
}
