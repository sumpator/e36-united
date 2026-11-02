import {clean} from '../../utils/text.js';
// Shared with the Club projection; subscribing to news is never a completeness condition.
export function memberProfileCompletion(member, {carCount=0, approvedPhotoCount=0}={}) {
  const criteria={requiredFields:!!(clean(member?.name)&&clean(member?.email)&&clean(member?.member_code)),historyReviewed:!!member?.history_completed_at,hasCar:Number(carCount)>0,approvedPhotos:Number(approvedPhotoCount)};
  return {...criteria,complete:criteria.requiredFields&&criteria.historyReviewed&&criteria.hasCar&&criteria.approvedPhotos>=5};
}
