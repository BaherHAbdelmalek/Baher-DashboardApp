// Visual styling now lives in src/index.css — real CSS is the only way to
// express the media queries, hover-vs-touch rules, safe-area insets and dark
// mode that this app needs across phone, iPad and desktop. What's left here is
// data, not presentation.

export const DEFAULT_PROJECTS = [
  "MTO / Compass IoT",
  "Side Engineering",
  "Finance",
  "Church/Service",
  "Admin",
  "Other",
];

// Retained because the `urgency` column still exists in the database for
// historical rows; the UI uses due dates, priority and flags instead.
export const URGENCY = [
  { id: "now", label: "Now" },
  { id: "soon", label: "Soon" },
  { id: "later", label: "Later" },
];
