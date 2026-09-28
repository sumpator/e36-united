// Calendar dates are event-local dates, not browser UTC conversions.
export function programDays(event) {
 const start=event?.startsOn, end=event?.endsOn;
 const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(!valid(start)||!valid(end)||end<start)throw new Error('Ročník nemá platně nastavený začátek a konec akce.');
 const days=[];for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000){if(days.length>7)throw new Error('Rozsah ročníku neurčuje jediný pátek, sobotu a neděli.');days.push(new Date(t));}
 return [5,6,0].map((weekday,i)=>{const matches=days.filter(d=>d.getUTCDay()===weekday);if(matches.length!==1)throw new Error('V nastavení ročníku chybí jednoznačný '+['pátek','sobota','neděle'][i]+'.');return{day:matches[0].toISOString().slice(0,10),label:['PÁTEK','SOBOTA','NEDĚLE'][i]};});
}
export function programTimes(day,from='',to='') {
 if([from,to].some(value=>value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw new Error('Zadej čas ve formátu HH:mm.');
 if(to&&!from)throw new Error('Čas do vyžaduje také čas od.');
 if(from&&from===to)throw new Error('Začátek a konec nemohou být stejné.');
 const endDay=to&&to<from?new Date(Date.parse(day)+86400000).toISOString().slice(0,10):day;
 return{startsAt:from?day+'T'+from:'',endsAt:to?endDay+'T'+to:null};
}
