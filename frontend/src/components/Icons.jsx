// Small inline SVG icons (no icon library needed).
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const ShieldIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const CheckCircleIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></svg>
);
export const WarningIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
);
export const InfoIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
);
export const UploadIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></svg>
);
export const WalletIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>
);
export const LockIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
export const CopyIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
export const ExternalIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
);
export const SpinnerIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className="spin" {...base} {...p}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
);
export const LeafIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></svg>
);
export const SatelliteIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="m13 7 4-4 4 4-4 4" /><path d="m3 17 4-4 4 4-4 4" /><path d="m9 9 6 6" /><path d="M14 19a5 5 0 0 0 5-5" /><path d="M14 22a8 8 0 0 0 8-8" /></svg>
);
export const UsersIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const CoinsIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
);
export const ScaleIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M12 3v18M5 21h14" /><path d="m5 7 7-3 7 3" /><path d="M2 14l3-7 3 7a3 3 0 0 1-6 0zM16 14l3-7 3 7a3 3 0 0 1-6 0z" /></svg>
);
export const FileIcon = (p) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15l2 2 4-4" /></svg>
);
