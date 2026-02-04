# Time Clock — Employee Login + Manager Dashboard (GitHub Pages)

This is a GitHub Pages friendly site with:
- **Firebase Authentication** (email/password)
- **Firestore** cloud storage for time logs
- **Employee page** for Clock In / Lunch Out / End Lunch / Clock Out
- **Manager dashboard** to see everyone’s hours, last week totals, and export a master Excel

## What you get
- Eastern Time stamps (**America/New_York**) no matter where someone is.
- Cloud-backed logs (multi-device safe).
- Export to Excel (XLSX) and CSV.
- Manager role gates access.

---

## 1) Firebase setup (10 minutes)

### A) Create project
1. Go to Firebase Console → create a project

### B) Enable Authentication
1. Build → Authentication → Get started
2. Sign-in method → enable **Email/Password**

### C) Create Firestore database
1. Build → Firestore Database → Create database
2. Choose **Production mode**

### D) Add a Web App + copy config
1. Project settings → Your apps → Web App → Register
2. Copy the config object
3. Paste into: **firebase-config.js** (replace PASTE_ME values)

---

## 2) Firestore Security Rules
In Firestore → Rules, paste:

See `firestore.rules`

Publish.

---

## 3) Make a Manager account
1. Open your site → create an account for the manager (signup)
2. In Firestore → Data:
   - Collection: `users`
   - Document: (manager user's uid)
   - Set field: `role` = `manager`

Now that account will redirect to **manager.html** and can view everyone's logs.

---

## 4) Deploy to GitHub Pages
Upload these files to your repo root:
- index.html
- signup.html
- employee.html
- manager.html
- style.css
- firebase-config.js
- auth.js
- employee.js
- manager.js
- common.js
- README.html (optional)

Then GitHub:
Settings → Pages → Deploy from branch → main / root.

---

## Data model
### users/{uid}
- name
- company
- email
- role: employee | manager

### timeLogs/{uid_YYYY-MM-DD}
- uid
- userName
- company
- estDate
- day
- clockIn, lunchOut, endLunch, clockOut (HH:MM:SS)
- notes
- updatedAt (server timestamp)

---

## Notes
- This is not a payroll system. It’s a clean time logging tool.
- If you want manager approval, signatures, or edits lockouts, tell me and I’ll add it.
