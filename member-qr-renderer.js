import qrcode from './vendor/qrcode-generator.mjs?v=20260923-live6';

const MEMBER_QR_PATTERN=/^E36U1:[a-f0-9]{48}$/;

export function memberQrSvg(payload){
  if(!MEMBER_QR_PATTERN.test(payload||''))return'';
  const qr=qrcode(0,'H');
  qr.addData(payload,'Byte');
  qr.make();
  return qr.createSvgTag({cellSize:6,margin:24,scalable:true,alt:'United QR identita člena'});
}

export function memberQrMarkup(payload){
  const svg=memberQrSvg(payload);
  return svg?`<span class="member-qr-symbol">${svg}<img alt="" aria-hidden="true" src="assets/united-qr-mark.svg"></span>`:'';
}
