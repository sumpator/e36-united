import { portalConfig } from '../firebase-config.js?v=20260823-auth2';
import { adminState } from './state.js?v=20260903-mailing-b';

export const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');

export async function apiRequest(path,{method='GET',body,retry=true}={}){
  if(!adminState.currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await adminState.currentUser.getIdToken(!retry);
  const response=await fetch(`${apiBaseUrl}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  if(response.status===401&&retry)return apiRequest(path,{method,body,retry:false});
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
  if(!response.ok){const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}

export async function apiMedia(path,{retry=true}={}){
  if(!adminState.currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await adminState.currentUser.getIdToken(!retry);
  const response=await fetch(`${apiBaseUrl}${path}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(response.status===401&&retry)return apiMedia(path,{retry:false});
  if(!response.ok){
    const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
    const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error;
  }
  return response.blob();
}

export async function apiUpload(path,file,{retry=true}={}){
  if(!adminState.currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await adminState.currentUser.getIdToken(!retry),body=new FormData();body.append('file',file);
  const response=await fetch(`${apiBaseUrl}${path}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`},body,cache:'no-store'});
  if(response.status===401&&retry)return apiUpload(path,file,{retry:false});
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
  if(!response.ok){const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}
