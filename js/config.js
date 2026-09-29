/* ==========================================================
   Job Line — configuration
   Edit this file only. Everything else runs automatically.
   ========================================================== */
window.JOBLINE_CONFIG = {
  // "github"   → reads data/applications.json from this repo (GitHub Pages).
  //              Edits are kept on your device until you "Export for GitHub" and push.
  // "firebase" → live database. Every edit syncs instantly to every device,
  //              no pushing needed. Fill in the firebase block below first.
  mode: "github",

  dataUrl: "data/applications.json",

  // Shown in the greeting. Can also be changed in Settings.
  ownerName: "",

  // Defaults (Settings screen can override them on each device).
  monthlyTarget: 100,
  followUpAfterDays: 10,
  staleAfterDays: 30,

  // Firebase project settings (Firebase console → Project settings → Your apps → Web app).
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // Lists used in forms and filters (same as the Excel dropdowns).
  statuses: ["Applied", "Application Pending", "Screening", "Interview Scheduled", "Offer Received", "Rejected", "Withdrawn"],
  channels: ["LinkedIn", "JobStreet", "HIREDLY", "Find Compnay Website", "Google Jobs", "Facebook", "Maukerja / Other"],
  appliedThrough: ["LinkedIn", "Email", "Website", "Michael Page", "Jobstreet", "HIREDLY"],
  employmentTypes: ["Full-time", "Contract", "Part-time", "Internship", "Remote"]
};
