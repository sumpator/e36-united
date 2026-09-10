import { portalConfig } from '../firebase-config.js?v=20260910-admin-private-media-r6';
import { adminState } from './state.js?v=20260910-admin-private-media-r6';
import { createAdminApiClient } from './request-client.js?v=20260910-admin-private-media-r6';

export const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const client=createAdminApiClient({baseUrl:apiBaseUrl,
  getContext:()=>({user:adminState.currentUser,generation:adminState.sessionGeneration,eventId:adminState.selectedEventId}),
  onDenied:error=>globalThis.window?.dispatchEvent(new CustomEvent('admin:accesslost',{detail:{status:error.status}})),
});
export const apiRequest=(path,options)=>client.request(path,options);
export const apiMedia=(path,options={})=>client.request(path,{...options,consume:'blob'});
export function apiUpload(path,file,options={}){const body=new FormData();body.append('file',file);return client.request(path,{...options,method:'PUT',body})}
