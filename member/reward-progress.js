export function rewardProgress(value){
 const total=Math.max(0,Math.floor(Number(value)||0)),milestones=Math.floor(total/12),cycle=total%12;
 return {total,milestones,cycle,remaining:12-cycle,justReached:total>0&&cycle===0};
}

export function pointWord(value){const n=Math.abs(Number(value)||0);return n===1?'bod':n>=2&&n<=4?'body':'bodů'}
export function milestoneLabel(value){return value===1?'dosažený milník':value>=2&&value<=4?'dosažené milníky':'dosažených milníků'}
