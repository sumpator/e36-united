// Conservative plan-derived engineering estimates, NOT Cloudflare meta.rows_read.
// See docs/admin-v2-free-tier-budget.md for population/loop bounds and limitations.
export const ROW_READ_BOUNDS=Object.freeze({summary:6000,reservationList:5000,reservationDetail:3000,gallery:3000,historyReview:12000,accommodation:2000,memberList:1000,search:5000,memberHeader:20,memberTab:100,mailing:1000000});
export function adminBudget(contexts,hours){
 const b=ROW_READ_BOUNDS,scale=hours/12;
 // Per context: 4h identity/event, 4h Garage, 2h list+reservation editor,
 // 1h Dashboard, 1h gallery. Explicit actions scale with duration.
 const components={member:240*b.memberHeader+240*(b.memberHeader+b.memberTab),reservation:60*b.reservationList+120*b.reservationDetail+24*b.summary,dashboard:12*b.summary,gallery:30*b.gallery+12*b.summary,search:60*b.search,memberOpening:60*(b.memberHeader+b.memberTab),ownMutationReconcile:20*(b.reservationList+b.reservationDetail+b.summary+20),mediaAndAuth:390*5,bootFunnel:6000,lifecycleAllowance:12*(b.summary+b.reservationList+b.reservationDetail)};
 const rows=Math.ceil(Object.values(components).reduce((a,b)=>a+b,0)*contexts*scale);
 return{contexts,hours,periodicDataRequestCeiling:contexts*hours*60*3,rowsReadEstimate:rows,targetForThreeAdmins12h:1000000,targetMet:contexts===3&&hours===12?rows<=1000000:null,componentsPerContext12h:components};
}
