/** Customer-facing order stages: label + badge colour. */
export const STAGES = {
  pending_payment: ['Waiting for payment', 'warn'],
  queued: ['In print queue', 'info'],
  printing: ['Printing', 'info'],
  attention: ['Shop is checking your prints', 'warn'],
  ready: ['Ready to collect', 'ok'],
  collected: ['Collected', 'done'],
  cancelled: ['Cancelled', 'done'],
  expired: ['Details no longer available', 'done'],
};

export const OPEN_STAGES = ['pending_payment', 'queued', 'printing', 'attention', 'ready'];

export const stageLabel = (s, payAtCounter) => (s === 'pending_payment' && payAtCounter ? 'Pay at the counter' : STAGES[s]?.[0] || s);
export const stageTone = (s) => STAGES[s]?.[1] || 'info';
