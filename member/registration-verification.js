// Firebase remains the authority and the sender until privileged action-link generation is configured.
// Called only after successful password account creation, never on login/profile edits.
const attempts=new WeakMap();
export function verifyNewPasswordAccount(firebase,user){
 if(!user||user.emailVerified||user.providerData?.length&&!user.providerData.some(p=>p.providerId==='password'))return Promise.resolve({needed:false});
 if(attempts.has(user))return attempts.get(user);
 const pending=(async()=>{
  try{await firebase.sendEmailVerification(user);return {needed:true,requested:true}}
  catch{return {needed:true,requested:false}} // The already-created account must not be reported as nonexistent.
 })();attempts.set(user,pending);return pending;
}
