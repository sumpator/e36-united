// One small, local outline family; decorative SVGs never replace control labels.
const paths = {
  dashboard: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  reservations: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  payments: '<rect x="2" y="5" width="20" height="15" rx="2"/><path d="M2 10h20M6 15h4"/>',
  community: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
  members: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  photos: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  'united-club': '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  mailing: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 5 10 8L22 5"/>',
  settings: '<path d="m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  approvals: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m7 12 3 3 7-7"/>',
  'reservation-summary': '<path d="M3 20V6m18 14V9M3 16h18M3 9h7v7m0-6h11"/><circle cx="6" cy="12" r="1"/>',
  trend: '<path d="M3 3v18h18M7 16l4-6 4 3 6-9"/>',
  recent: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
};
export function commandIcon(name) {
  return '<svg class="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name==='payment-summary'?'payments':name]||paths.dashboard)+'</svg>';
}
