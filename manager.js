import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { estDateISO, startOfWeekISO, addDaysISO, calcLunchMins, calcTotalHours, downloadBlob } from "./common.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const els = {
  logout: $("logout"),
  who: $("who"),
  company: $("company"),
  name: $("name"),
  from: $("from"),
  to: $("to"),
  run: $("run"),
  lastWeek: $("lastWeek"),
  thisWeek: $("thisWeek"),
  exportXlsx: $("exportXlsx"),
  msg: $("msg"),
  summaryBody: $("summaryBody"),
  detailBody: $("detailBody"),
  grandTotal: $("grandTotal"),
};

function weekRange(which){
  const today = estDateISO();
  const thisMon = startOfWeekISO(today);
  const from = which === "last" ? addDaysISO(thisMon, -7) : thisMon;
  const to = which === "last" ? addDaysISO(thisMon, -1) : addDaysISO(thisMon, 6);
  return {from,to};
}

function setMsg(t){ els.msg.textContent = t || ""; }

function rowsToAOA(rows){
  const header = ["Date","Day","Name","Company","Clock In","Lunch Out","End Lunch","Clock Out","Lunch (mins)","Total Hours","Notes"];
  const data = rows.map(r => [
    r.estDate, r.day, r.userName, r.company,
    r.clockIn||"", r.lunchOut||"", r.endLunch||"", r.clockOut||"",
    calcLunchMins(r) === "" ? "" : calcLunchMins(r),
    calcTotalHours(r) === "" ? "" : calcTotalHours(r),
    r.notes || ""
  ]);
  return [header, ...data];
}

function exportMasterXLSX(rows, filename){
  if(typeof XLSX === "undefined"){
    alert("XLSX library not loaded yet. Try again in a second.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const aoa = rowsToAOA(rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!freeze"] = {xSplit:0, ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws, "Master Log");

  // Add summary sheet (by employee)
  const summary = new Map();
  rows.forEach(r=>{
    const key = `${r.userName}__${r.company}`;
    const h = calcTotalHours(r);
    if(h === "") return;
    summary.set(key, (summary.get(key) || 0) + Number(h));
  });
  const sAoa = [["Employee","Company","Range Hours"]];
  for(const [k,v] of summary.entries()){
    const [n,c] = k.split("__");
    sAoa.push([n,c, Math.round(v*100)/100]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(sAoa);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");
  XLSX.writeFile(wb, filename);
}

function renderSummary(rows){
  els.summaryBody.innerHTML = "";
  els.detailBody.innerHTML = "";

  // summary by employee
  const map = new Map();
  rows.forEach(r=>{
    const key = `${r.userName}__${r.company}`;
    const h = calcTotalHours(r);
    if(h === "") return;
    const entry = map.get(key) || {name:r.userName, company:r.company, hours:0, days:0};
    entry.hours += Number(h);
    entry.days += 1;
    map.set(key, entry);
  });

  let grand = 0;
  for(const entry of map.values()){
    grand += entry.hours;
    const tr = document.createElement("tr");
    [entry.name, entry.company, (Math.round(entry.hours*100)/100)+"", entry.days+""].forEach(v=>{
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    els.summaryBody.appendChild(tr);
  }
  els.grandTotal.textContent = rows.length ? (Math.round(grand*100)/100 + " hrs") : "—";

  // detail rows
  rows
    .sort((a,b)=> (a.estDate < b.estDate ? 1 : -1))
    .forEach(r=>{
      const tr = document.createElement("tr");
      const lunchM = calcLunchMins(r);
      const totalH = calcTotalHours(r);
      const cells = [
        r.estDate, r.day, r.userName, r.company,
        r.clockIn||"", r.lunchOut||"", r.endLunch||"", r.clockOut||"",
        lunchM === "" ? "" : String(lunchM),
        totalH === "" ? "" : String(totalH),
        r.notes || ""
      ];
      cells.forEach(v=>{
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      els.detailBody.appendChild(tr);
    });
}

async function fetchRows(fromISO, toISO, company, nameContains){
  // Firestore querying limitations: for flexible search, we pull by date range and then filter in JS.
  // If you want strict server-side filtering, we can add indexes and denormalized fields later.
  const qy = query(
    collection(db, "timeLogs"),
    where("estDate", ">=", fromISO),
    where("estDate", "<=", toISO),
    orderBy("estDate","desc")
  );
  const snap = await getDocs(qy);
  let rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));

  if(company){
    const c = company.trim().toLowerCase();
    rows = rows.filter(r => (r.company || "").toLowerCase().includes(c));
  }
  if(nameContains){
    const n = nameContains.trim().toLowerCase();
    rows = rows.filter(r => (r.userName || "").toLowerCase().includes(n));
  }
  return rows;
}

onAuthStateChanged(auth, async (user) => {
  if(!user){
    location.href = "index.html";
    return;
  }
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if(!profileSnap.exists()){
    await signOut(auth);
    location.href = "index.html";
    return;
  }
  const profile = profileSnap.data();
  if((profile.role || "employee") !== "manager"){
    location.href = "employee.html";
    return;
  }
  els.who.textContent = `${profile.name} • ${profile.company}`;

  const r = weekRange("this");
  els.from.value = r.from;
  els.to.value = r.to;

  els.thisWeek.addEventListener("click", ()=>{
    const rr = weekRange("this");
    els.from.value = rr.from; els.to.value = rr.to;
  });
  els.lastWeek.addEventListener("click", ()=>{
    const rr = weekRange("last");
    els.from.value = rr.from; els.to.value = rr.to;
  });

  let lastRows = [];

  els.run.addEventListener("click", async ()=>{
    setMsg("Running…");
    try{
      lastRows = await fetchRows(els.from.value, els.to.value, els.company.value, els.name.value);
      renderSummary(lastRows);
      setMsg(`Found ${lastRows.length} day-rows in range.`);
    }catch(e){
      setMsg(e?.message || "Report failed.");
    }
  });

  els.exportXlsx.addEventListener("click", ()=>{
    const fn = `master_time_log_${els.from.value}_to_${els.to.value}.xlsx`;
    exportMasterXLSX(lastRows, fn);
  });

  els.logout.addEventListener("click", async ()=>{
    await signOut(auth);
    location.href = "index.html";
  });

  // initial run
  els.run.click();
});
