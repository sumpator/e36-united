// SQL counterparts of the existing Admin list filters. Values are always bound.
export const PAYMENT_STATE_SQL="CASE WHEN r.amount_paid_czk>r.amount_due_czk THEN 'overpaid' WHEN r.amount_paid_czk=r.amount_due_czk THEN CASE WHEN r.amount_due_czk=0 THEN 'not_required' ELSE 'paid' END WHEN r.amount_paid_czk>0 THEN 'underpaid' ELSE 'unpaid' END";
export const OVERDUE_SQL="(r.status='approved' AND r.amount_due_czk>r.amount_paid_czk AND julianday(CASE WHEN length(e.payment_deadline)=10 THEN e.payment_deadline||'T23:59:59Z' ELSE e.payment_deadline END)<julianday('now'))";
export function reservationFilterSql(filter,payments=false){
 const pay=PAYMENT_STATE_SQL,attention=`(${OVERDUE_SQL} OR r.amount_paid_czk>r.amount_due_czk)`;
 if(filter==='all')return '1';
 if(filter==='action'||filter==='attention')return payments?attention:`(r.status='pending' OR ${attention})`;
 if(filter==='active')return `(r.status='approved' AND (${pay}) IN ('unpaid','underpaid'))`;
 if(filter==='complete')return `(r.status='approved' AND (${pay}) IN ('paid','not_required'))`;
 if(filter==='payment')return `(r.status='approved' AND (${pay})='unpaid')`;
 if(['unpaid','underpaid','paid','overpaid','not_required'].includes(filter))return `(${pay})='${filter}'`;
 if(['pending','approved','rejected','cancelled'].includes(filter))return `r.status='${filter}'`;
 return '1';
}
export function reservationListQuery(url){
 const p=url.searchParams,payments=p.get('view')==='payments',bindings=[],parts=[reservationFilterSql(p.get('filter')||'all',payments)];
 const details=(p.get('filters')||'').split(',').filter(Boolean);
 if(!payments&&details.length)parts.push('('+details.map(f=>reservationFilterSql(f)).join(' OR ')+')');
 const query=(p.get('q')||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().slice(0,200);
 if(query){
   let expression="lower(COALESCE(m.name,'')||' '||COALESCE(m.nickname,'')||' '||COALESCE(m.email,'')||' '||COALESCE(m.member_code,'')||' '||COALESCE(r.payment_vs,'')||' '||COALESCE(r.car_nickname,'')||' '||COALESCE(r.car_model,'')||' '||COALESCE(r.car_body,''))";
   for(const letter of 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ')expression=`replace(${expression},'${letter}','${letter.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}')`;
   parts.push(`instr(${expression},?)>0`);bindings.push(query);
 }
 const detail=p.get('id');if(detail){parts.length=0;parts.push('r.id=?');bindings.length=0;bindings.push(detail)}
 return{where:parts.join(' AND '),bindings,page:Math.max(1,Math.min(100000,parseInt(p.get('page'))||1)),pageSize:Math.max(1,Math.min(100,parseInt(p.get('pageSize'))||50))};
}
