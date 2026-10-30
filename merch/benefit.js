import {portalConfig} from '../firebase-config.js?v=20260924-merch2';

// The catalog configuration is also used by the server's quoteLines calculation.
export function merchBenefit(settings={}){
 const threshold=Number(settings?.rewardThreshold)||12,rate=settings?.discountBasisPoints;
 const active=Number.isInteger(rate)&&rate>0,percent=active?new Intl.NumberFormat('cs-CZ').format(rate/100):null;
 return {threshold,active,percent,title:active?`Od ${threshold} bodů: sleva ${percent} % na Merch`:'United Merch',copy:active?`Od ${threshold} bodů získáš slevu ${percent} % na zboží v Merchi. Přesnou slevu ověří serverová rekapitulace; dopravné zůstává samostatně.`:'Nákupní sleva zatím není nastavená. Před objednáním rozhoduje serverová rekapitulace.',paused:settings?.paused===true};
}
let pending;
export function loadMerchBenefitSettings(){
 if(!pending)pending=fetch((portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'')+'/api/merch/catalog',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Merch configuration unavailable');return (await response.json()).settings||{}}).catch(error=>{pending=null;throw error});
 return pending;
}
