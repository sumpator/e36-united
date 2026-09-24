export function rewardProgress(value){
 const total=Math.max(0,Math.floor(Number(value)||0)),milestones=Math.floor(total/12),cycle=total%12;
 return {total,milestones,cycle,remaining:12-cycle,justReached:total>0&&cycle===0};
}
