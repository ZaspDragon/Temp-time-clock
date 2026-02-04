import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { estDateISO, estTimeHHMMSS, estPrettyDate, estPrettyTime, dayNameFromISO, calcLunchMins, calcTotalHours, downloadBlob, startOfWeekISO, addDaysISO } from "./common.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const els = {
  estNow: $("estNow"),
  estDate: $("estDate"),
  who: $("who"),
  managerLink: $("managerLink"),
  logout: $("logout"),
  statusText: $("statusText"),
  clockIn: $("clockIn"),
  lunchOut: $("lunchOut"),
  endLunch: $("endLunch"),
  clockOut: $("clockOut"),
  vClockIn: $("vClockIn"),
  vLunchOut: $("vLunchOut"),
  vEndLunch: $("vEndLunch"),
  vClockOut: $("vClockOut"),
  vHours: $("vHours"),
  vBreakdown: $("vBreakdown"),
  tbody: $("tbody"),
  from: $("from"),
  to: $("to"),
  rangeTotal: $("rangeTotal"),
  lastWeek: $("lastWeek"),
  thisWeek: $("thisWeek"),
  exportCsv: $("exportCsv"),
  exportXlsx: $("exportXlsx"),
};

function tick(){
  els.estNow.textContent = estPrettyTime();
  els.estDate.textContent = estPrettyDate();
}
tick(); setInterval(tick, 500);

function statusFor(row){
  if(row.clockOut) return "Clocked Out";
  if(row.endLunch) return "Working";
  if(row.lunchOut) return "At Lunch";
  if(row.clockIn) return "Clocked In";
  return "Not started";
}

function renderToday(row){
  els.vClockIn.textContent = row.clockIn || "—";
  els.vLunchOut.textContent = row.lunchOut || "—";
  els.vEndLunch.textContent = row.endLunch || "—";
  els.vClockOut.textContent = row.clockOut || "—";
  const lunchMins = calcLunchMins(row);
  const totalHours = calcTotalHours(row);
  els.vHours.textContent = totalHours === "" ? "—" : `${totalHours} hrs`;
  const pieces = [];
  if(row.clockIn && row.clockOut) pieces.push(`Shift: ${row.clockIn} → ${row.clockOut}`);
  if(lunchMins !== "") pieces.push(`Lunch: ${lunchMins} mins`);
  els.vBreakdown.textContent = pieces.join(" • ");
  els.statusText.textContent = statusFor(row);

  // order + duplicates
  els.clockIn.disabled = !!row.clockIn;
  els.lunchOut.disabled = !row.clockIn || !!row.lunchOut || !!row.clockOut;
  els.endLunch.disabled = !row.lunchOut || !!row.endLunch || !!row.clockOut;
  els.clockOut.disabled = !row.clockIn || !!row.clockOut;
}

function renderTable(rows){
  els.tbody.innerHTML = "";
  let sum = 0;
  rows.forEach(r => {
    const tr = document.createElement("tr");
    const lunchM = calcLunchMins(r);
    const totalH = calcTotalHours(r);
    if(totalH !== "") sum += Number(totalH);

    const cells = [
      r.estDate, r.day, r.clockIn||"", r.lunchOut||"", r.endLunch||"", r.clockOut||"",
      lunchM === "" ? "" : String(lunchM),
      totalH === "" ? "" : String(totalH),
      r.notes || ""
    ];
    cells.forEach((val,i)=>{
      const td = document.createElement("td");
      td.textContent = val;
      if(i===8){
        td.contentEditable = "true";
        td.addEventListener("input", async ()=>{
          try{
            await updateDoc(doc(db, "timeLogs", r.id), { notes: td.textContent.trim() });
          }catch(e){}
        });
      }
      tr.appendChild(td);
    });
    els.tbody.appendChild(tr);
  });
  els.rangeTotal.value = rows.length ? (Math.round(sum*100)/100 + " hrs") : "";
}

function rowsToAOA(rows, profile){
  const header = ["Date","Day","Name","Company","Clock In","Lunch Out","End Lunch","Clock Out","Lunch (mins)","Total Hours","Notes"];
  const data = rows.map(r => [
    r.estDate, r.day, profile.name, profile.company,
    r.clockIn||"", r.lunchOut||"", r.endLunch||"", r.clockOut||"",
    calcLunchMins(r) === "" ? "" : calcLunchMins(r),
    calcTotalHours(r) === "" ? "" : calcTotalHours(r),
    r.notes || ""
  ]);
  return [header, ...data];
}

function exportCSV(rows, profile){
  const aoa = rowsToAOA(rows, profile);
  const lines = aoa.map(row => row.map(v => {
    const s = String(v ?? "");
    if(s.includes(",") || s.includes('"') || s.includes("\n")){
      return '"' + s.replaceAll('"','""') + '"';
    }
    return s;
  }).join(",")).join("\n");
  downloadBlob(`timeclock_${profile.name.replaceAll(" ","_")}_${estDateISO()}.csv`, new Blob([lines], {type:"text/csv;charset=utf-8"}));
}

function exportXLSX(rows, profile){
  if(typeof XLSX === "undefined"){
    alert("XLSX library not loaded yet. Try again in a second.");
    return;
  }
  const aoa = rowsToAOA(rows, profile);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!freeze"] = {xSplit:0, ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws, "Log");
  XLSX.writeFile(wb, `timeclock_${profile.name.replaceAll(" ","_")}_${estDateISO()}.xlsx`);
}

async function loadRange(uid, fromISO, toISO){
  // inclusive range by string compare YYYY-MM-DD
  const qy = query(
    collection(db, "timeLogs"),
    where("uid","==", uid),
    where("estDate", ">=", fromISO),
    where("estDate", "<=", toISO),
    orderBy("estDate", "desc")
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

async function loadToday(uid){
  const today = estDateISO();
  const id = `${uid}_${today}`;
  const ref = doc(db, "timeLogs", id);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    return { id, uid, estDate: today, day: dayNameFromISO(today), clockIn:"", lunchOut:"", endLunch:"", clockOut:"", notes:"" };
  }
  return { id, ...snap.data() };
}

async function ensureTodayDoc(todayRow, profile){
  const ref = doc(db, "timeLogs", todayRow.id);
  const payload = {
    uid: todayRow.uid,
    userName: profile.name,
    company: profile.company,
    estDate: todayRow.estDate,
    day: todayRow.day,
    clockIn: todayRow.clockIn || "",
    lunchOut: todayRow.lunchOut || "",
    endLunch: todayRow.endLunch || "",
    clockOut: todayRow.clockOut || "",
    notes: todayRow.notes || "",
    updatedAt: serverTimestamp(),
  };
  // Set merge so we don't overwrite unexpectedly
  await setDoc(ref, payload, { merge: true });
}

function weekRange(which){
  // which: this | last
  const today = estDateISO();
  const thisMon = startOfWeekISO(today);
  const from = which === "last" ? addDaysISO(thisMon, -7) : thisMon;
  const to = which === "last" ? addDaysISO(thisMon, -1) : addDaysISO(thisMon, 6);
  return {from,to};
}

onAuthStateChanged(auth, async (user) => {
  if(!user){
    location.href = "index.html";
    return;
  }
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if(!userSnap.exists()){
    await signOut(auth);
    location.href = "index.html";
    return;
  }
  const profile = userSnap.data();
  els.who.textContent = `${profile.name} • ${profile.company} • ${profile.role || "employee"}`;

  if((profile.role || "employee") === "manager"){
    els.managerLink.style.display = "inline-flex";
  }

  // default range = this week
  const {from, to} = weekRange("this");
  els.from.value = from;
  els.to.value = to;

  // today
  let todayRow = await loadToday(user.uid);
  todayRow.uid = user.uid;
  await ensureTodayDoc(todayRow, profile);
  renderToday(todayRow);

  // range table
  let rangeRows = await loadRange(user.uid, els.from.value, els.to.value);
  renderTable(rangeRows);

  async function refreshRange(){
    rangeRows = await loadRange(user.uid, els.from.value, els.to.value);
    renderTable(rangeRows);
  }

  els.from.addEventListener("change", refreshRange);
  els.to.addEventListener("change", refreshRange);

  els.thisWeek.addEventListener("click", async ()=>{
    const r = weekRange("this");
    els.from.value = r.from; els.to.value = r.to;
    await refreshRange();
  });
  els.lastWeek.addEventListener("click", async ()=>{
    const r = weekRange("last");
    els.from.value = r.from; els.to.value = r.to;
    await refreshRange();
  });

  async function stamp(field){
    // reload latest to prevent double clicks across devices
    todayRow = await loadToday(user.uid);
    if(todayRow[field]) return;
    todayRow.uid = user.uid;
    todayRow[field] = estTimeHHMMSS();
    await ensureTodayDoc(todayRow, profile);
    renderToday(todayRow);
    await refreshRange();
  }

  els.clockIn.addEventListener("click", () => stamp("clockIn"));
  els.lunchOut.addEventListener("click", () => stamp("lunchOut"));
  els.endLunch.addEventListener("click", () => stamp("endLunch"));
  els.clockOut.addEventListener("click", () => stamp("clockOut"));

  els.exportCsv.addEventListener("click", () => exportCSV(rangeRows, profile));
  els.exportXlsx.addEventListener("click", () => exportXLSX(rangeRows, profile));

  els.logout.addEventListener("click", async ()=>{
    await signOut(auth);
    location.href = "index.html";
  });
});
