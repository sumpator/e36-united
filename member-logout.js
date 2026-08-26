export async function performMemberLogout({signOut,onSuccess,onFailure}){
  try{
    await signOut();
  }catch(error){
    onFailure?.(error);
    return false;
  }
  onSuccess?.();
  return true;
}
