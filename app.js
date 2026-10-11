"use strict";
// Change the builder name shown on the splash screen here.
const APP_BUILDER = "LINKON";
const STORAGE_KEY = "pakizaOT.v1";
const DEFAULT_SETTINGS = { day: 3, night: 4, fri1: 6, fri2: 18, theme: "light", lang: "en" };
const $ = id => document.getElementById(id);
const APP_URL = "https://linko81.github.io/newwwwww123/download.html";
const lang = () => (state && state.settings && state.settings.lang) || "en";
const tr = s => (lang() === "bn" && BN[s]) || s;
const tf = (en, bn) => (lang() === "bn" ? bn : en);
const LOC = () => (lang() === "bn" ? "bn-BD-u-nu-latn" : "en-GB");
const _confirm = window.confirm.bind(window); window.confirm = m => _confirm(tr(m));

let state = load();
let editingId = null;
let cloud = null, cloudUser = null, syncReady = false, syncTimer = null, supActive = null, onlineWorkers = [];
const CLOUD_FLAG = "linkonCloud";
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });

function load() {
  const fresh = { employee: { name: "", id: "" }, month: new Date().toISOString().slice(0, 7),
                  settings: { ...DEFAULT_SETTINGS }, records: [],
                  pay: { basic: 0, rate: 0, nightBill: 0, currency: "Tk" }, bonuses: {}, avatar: "", themeV3: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.records)) return { ...fresh, ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings },
      pay: { ...fresh.pay, ...saved.pay }, bonuses: saved.bonuses || {}, avatar: saved.avatar || "",
      ...(saved.themeV3 ? {} : { themeV3: true, settings: { ...DEFAULT_SETTINGS, ...saved.settings, theme: "light" } }) };
  } catch (e) { /* ignore corrupt data */ }
  return fresh;
}
function save() {
  if (syncReady) scheduleSync();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast("Could not save: device storage is full or blocked."); }
}
function toast(msg) { const t = $("toast"); t.textContent = tr(msg); t.className = "show"; setTimeout(() => t.className = "", 2400); }

// Shift definitions are built from settings, so rules are never hard-coded.
function shiftOptions() {
  const s = state.settings;
  return [
    { key: "day", label: `${tr("Day")} — ${s.day} ${tr("hours")}`, hours: s.day, group: "Day" },
    { key: "night", label: `${tr("Night")} — ${s.night} ${tr("hours")}`, hours: s.night, group: "Night" },
    { key: "fri1", label: `${tr("Friday")} — ${s.fri1} ${tr("hours")}`, hours: s.fri1, group: "Friday" },
    { key: "fri2", label: `${tr("Friday")} — ${s.fri2} ${tr("hours")}`, hours: s.fri2, group: "Friday" },
    { key: "custom", label: tr("Custom"), hours: null, group: "Custom" }
  ];
}
const groupOf = key => (shiftOptions().find(o => o.key === key) || { group: "Custom" }).group;
const shiftName = key => ({ day: "Day", night: "Night", fri1: "Friday", fri2: "Friday", custom: "Custom" }[key] || "Custom");
const fmt = n => String(Math.round(n * 100) / 100);
const monthRecords = () => state.records.filter(r => r.date.startsWith(state.month)).sort((a, b) => a.date.localeCompare(b.date));
const monthName = ym => { const [y, m] = ym.split("-"); return new Date(y, m - 1, 1).toLocaleDateString(LOC(), { month: "long", year: "numeric" }); };
const dateName = d => new Date(d + "T00:00").toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" });

function renderShiftSelect() {
  const sel = $("recShift"), keep = sel.value || "day";
  sel.innerHTML = shiftOptions().map(o => `<option value="${o.key}">${o.label}</option>`).join("");
  sel.value = keep; onShiftChange();
}
function onShiftChange() {
  const opt = shiftOptions().find(o => o.key === $("recShift").value);
  if (opt.hours !== null) $("recHours").value = opt.hours;
  else if (editingId === null) $("recHours").value = "";
  $("recHours").readOnly = opt.hours !== null;
}
function renderSummary() {
  const recs = monthRecords(), g = { Day: [0, 0], Night: [0, 0], Friday: [0, 0], Custom: [0, 0] };
  let total = 0;
  recs.forEach(r => { const k = groupOf(r.shift); g[k][0] += r.hours; g[k][1]++; total += r.hours; });
  countUp($("totalHours"), total);
  const who = state.employee.name ? `${state.employee.name}${state.employee.id ? " (" + state.employee.id + ")" : ""} · ` : "";
  $("totalLabel").textContent = `${who}${monthName(state.month)}`;
  const icon = { Day: "☀️", Night: "🌙", Friday: "🌟", Custom: "✏️" };
  $("summaryTable").innerHTML = '<div class="tiles">' + Object.entries(g).map(([k, [h, c]]) =>
    `<div class="tile t-${k.toLowerCase()}"><span>${icon[k]} ${tr(k)} ${tr("OT")}</span><b>${fmt(h)} ${tr("h")}</b><small>${c} ${tr(c === 1 ? "record" : "records")}</small></div>`).join("") +
    `</div><div class="tile t-total"><span>${tr("Total OT")}</span><b>${fmt(total)} ${tr("h")}</b><small>${recs.length} ${tr(recs.length === 1 ? "record" : "records")}</small></div>`;
}
function renderRecords() {
  const recs = monthRecords();
  $("recordList").innerHTML = recs.length ? recs.map(r => `<div class="rec c-${groupOf(r.shift).toLowerCase()}"><div><b>${dateName(r.date)}</b>
    <small>${tr(shiftName(r.shift))} · ${fmt(r.hours)} ${tr("hours")}</small></div>
    <div><button data-edit="${r.id}">Edit</button><button class="danger" data-del="${r.id}">Delete</button></div></div>`).join("")
    : `<p class="empty">${tf(`No records for ${monthName(state.month)}. Add one on the Home tab.`, `${monthName(state.month)} মাসে কোনো রেকর্ড নেই। হোম ট্যাবে যোগ করুন।`)}</p>`;
}
function renderDayGrid() {
  const [y, m] = state.month.split("-").map(Number), days = new Date(y, m, 0).getDate(), perDay = {}, kind = {};
  monthRecords().forEach(r => { const d = Number(r.date.slice(8)), gk = groupOf(r.shift).toLowerCase(); perDay[d] = (perDay[d] || 0) + r.hours; kind[d] = kind[d] && kind[d] !== gk ? "mixed" : gk; });
  let html = "";
  for (let d = 1; d <= days; d++) html += `<div class="day${perDay[d] ? " has g-" + kind[d] : ""}" style="--i:${d}"><span>${d}</span><b>${perDay[d] ? fmt(perDay[d]) : "–"}</b></div>`;
  $("dayGrid").innerHTML = html + `<div class="legend"><i class="g-day"></i>Day <i class="g-night"></i>Night <i class="g-friday"></i>Friday <i class="g-custom"></i>Custom <i class="g-mixed"></i>Mixed</div><p class="empty">${tf(`${days} days in ${monthName(state.month)}. Hours worked are shown under each day.`, `${monthName(state.month)} মাসে ${days} দিন। প্রতিদিনের নিচে কাজের ঘণ্টা দেখানো হয়েছে।`)}</p>`;
}
const num = v => { const n = parseFloat(v); return n > 0 ? n : 0; };
const money = n => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + state.pay.currency;
function fillPay() {
  const b = state.bonuses[state.month] || {};
  $("payBasic").value = state.pay.basic || ""; $("payRate").value = state.pay.rate || ""; $("payNight").value = state.pay.nightBill || "";
  $("payCur").value = state.pay.currency; $("bonusAtt").value = b.attendance || ""; $("bonusAtd").value = b.attitude || "";
  renderPay();
}
function readPay() {
  state.pay = { basic: num($("payBasic").value), rate: num($("payRate").value), nightBill: num($("payNight").value), currency: $("payCur").value.trim() || "Tk" };
  state.bonuses[state.month] = { attendance: num($("bonusAtt").value), attitude: num($("bonusAtd").value) };
  save(); renderPay();
}
function renderPay() {
  const recs = monthRecords(), hours = recs.reduce((s, r) => s + r.hours, 0), nights = recs.filter(r => groupOf(r.shift) === "Night").length;
  const b = state.bonuses[state.month] || {}, otPay = hours * state.pay.rate, nightPay = nights * state.pay.nightBill;
  const total = (state.pay.basic || 0) + otPay + nightPay + (b.attendance || 0) + (b.attitude || 0);
  $("payResult").innerHTML = `<table>
    <tr><td>Basic salary</td><td>${money(state.pay.basic || 0)}</td></tr>
    <tr><td>${tr("OT pay")} (${fmt(hours)} ${tr("h")} × ${state.pay.rate})</td><td>${money(otPay)}</td></tr>
    <tr><td>${tr("Night bill")} (${nights} × ${state.pay.nightBill})</td><td>${money(nightPay)}</td></tr>
    <tr><td>Attendance bonus</td><td>${money(b.attendance || 0)}</td></tr>
    <tr><td>Attitude bonus</td><td>${money(b.attitude || 0)}</td></tr></table>
    <div class="paytotal"><span>FINAL AMOUNT</span><b>${money(total)}</b></div>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function slipData() {
  const recs = monthRecords(), g = { Day: [0, 0], Night: [0, 0], Friday: [0, 0], Custom: [0, 0] }; let hours = 0;
  recs.forEach(r => { const k = groupOf(r.shift); g[k][0] += r.hours; g[k][1]++; hours += r.hours; });
  const b = state.bonuses[state.month] || {}, rate = state.pay.rate, nb = state.pay.nightBill;
  const basic = state.pay.basic || 0, ot = hours * rate, night = g.Night[1] * nb, att = b.attendance || 0, atd = b.attitude || 0;
  return { recs, g, hours, basic, rate, nb, ot, night, att, atd, total: basic + ot + night + att + atd };
}
function slipText() {
  const s = slipData(), e = state.employee;
  return [`${tr("Pay Slip").toUpperCase()} - ${monthName(state.month)}`, `${tr("Employee:")} ${e.name || "-"}${e.id ? " (" + e.id + ")" : ""}`, "",
    ...Object.entries(s.g).map(([k, [h, c]]) => `${tr(k)} ${tr("OT")}: ${fmt(h)} ${tr("h")} (${c})`), `${tr("Total OT")}: ${fmt(s.hours)} ${tr("h")}`, "",
    `${tr("Basic salary")}: ${money(s.basic)}`, `${tr("OT pay")} (${fmt(s.hours)} x ${s.rate}): ${money(s.ot)}`, `${tr("Night bill")} (${s.g.Night[1]} x ${s.nb}): ${money(s.night)}`,
    `${tr("Attendance bonus")}: ${money(s.att)}`, `${tr("Attitude bonus")}: ${money(s.atd)}`, `${tr("FINAL AMOUNT")}: ${money(s.total)}`, "",
    tf("Made with LINKON, free overtime and pay slip app:", "LINKON দিয়ে তৈরি, ফ্রি ওভারটাইম ও পে স্লিপ অ্যাপ:") + " " + APP_URL].join("\n");
}
function showSlip() {
  const s = slipData(), e = state.employee, row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`, cnt = c => `${c} ${tr(c === 1 ? "record" : "records")}`;
  $("slipPaper").innerHTML = `<img src="banner.jpg" alt="">
    <h2>${tr("Pay Slip")}</h2><p class="sub">${esc(monthName(state.month))}</p>
    <p><b>${tr("Employee:")}</b> ${esc(e.name || "-")}${e.id ? " &nbsp; <b>" + tr("ID:") + "</b> " + esc(e.id) : ""}</p>
    <table>${Object.entries(s.g).map(([k, [h, c]]) => row(`${tr(k)} ${tr("OT")} (${cnt(c)})`, fmt(h) + " " + tr("h"))).join("")}${row("<b>" + tr("Total OT") + "</b>", "<b>" + fmt(s.hours) + " " + tr("h") + "</b>")}</table>
    <table>${row(tr("Basic salary"), money(s.basic))}${row(`${tr("OT pay")} (${fmt(s.hours)} ${tr("h")} × ${s.rate})`, money(s.ot))}${row(`${tr("Night bill")} (${s.g.Night[1]} × ${s.nb})`, money(s.night))}
    ${row(tr("Attendance bonus"), money(s.att))}${row(tr("Attitude bonus"), money(s.atd))}</table>
    <div class="slip-total"><span>${tr("FINAL AMOUNT")}</span><b>${money(s.total)}</b></div>
    <h3>${tr("OT records")}</h3><table>${s.recs.map(r => row(dateName(r.date) + " · " + tr(shiftName(r.shift)), fmt(r.hours) + " " + tr("h"))).join("") || row(tr("No records"), "")}</table>
    <p class="foot">${tr("Generated by LINKON")} · ${new Date().toLocaleDateString(LOC())}</p>
    <p class="foot">${tf("Free overtime and pay slip app", "ফ্রি ওভারটাইম ও পে স্লিপ অ্যাপ")}: ${APP_URL.replace("https://", "")}</p>`;
  $("slip").hidden = false; document.body.classList.add("slip-open"); $("slip").scrollTop = 0;
}
async function shareSlip() {
  const text = slipText();
  try { if (navigator.share) await navigator.share({ title: "Pay slip", text }); else { await navigator.clipboard.writeText(text); toast("Pay slip copied. Paste it in any chat."); } }
  catch (err) { /* share cancelled */ }
}
const TEAM_KEY = "linkonTeam.v1";
let team = loadTeam();
function loadTeam() { try { const t = JSON.parse(localStorage.getItem(TEAM_KEY)); return Array.isArray(t) ? t : []; } catch (e) { return []; } }
function saveTeam() { try { localStorage.setItem(TEAM_KEY, JSON.stringify(team)); } catch (e) { toast("Could not save team data."); } }
function validWorker(d) {
  return d && Array.isArray(d.records) && d.employee && typeof d.employee === "object" &&
    d.records.every(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.shift === "string" && r.hours > 0);
}
function workerMonth(w) {
  const recs = w.records.filter(r => r.date.startsWith(state.month)).sort((a, b) => a.date.localeCompare(b.date));
  const hours = recs.reduce((s, r) => s + r.hours, 0), nights = recs.filter(r => r.shift === "night").length;
  const p = w.pay || {}, b = (w.bonuses || {})[state.month] || {};
  const total = num(p.basic) + hours * num(p.rate) + nights * num(p.nightBill) + num(b.attendance) + num(b.attitude);
  return { recs, hours, total, cur: p.currency || "Tk" };
}
function workerCard(w, actions) {
  const m = workerMonth(w), n = m.recs.length;
  return `<div class="card"><h2>${esc(w.employee.name || tr("Unnamed"))}${w.employee.id ? " · " + esc(w.employee.id) : ""}</h2>
    <table><tr><td>${esc(monthName(state.month))} ${tr("OT")}</td><td>${fmt(m.hours)} ${tr("h")} · ${n} ${tr(n === 1 ? "record" : "records")}</td></tr>
    <tr><td>${tr("Final amount")}</td><td>${fmt(m.total)} ${esc(m.cur)}</td></tr></table>
    <details><summary>${tr("View records")}</summary>${m.recs.map(r => `<div class="rec c-${shiftName(r.shift).toLowerCase()}"><div><b>${dateName(r.date)}</b><small>${tr(shiftName(r.shift))} · ${fmt(r.hours)} ${tr("hours")}</small></div></div>`).join("") || `<p class="empty">${tr("No records this month.")}</p>`}</details>
    ${actions}</div>`;
}
function renderTeam() {
  $("teamList").innerHTML = team.length ? team.map((w, i) => workerCard(w, `<button class="danger" data-teamdel="${i}">Remove from team view</button>`)).join("") : '<p class="empty">No workers added from files yet.</p>';
  renderOnline();
}
function renderOnline() {
  $("onlineList").innerHTML = onlineWorkers.map(o => o.data
    ? workerCard({ employee: { name: String(o.data.name || ""), id: String(o.data.empId || "") },
        records: (o.data.records || []).filter(r => r && typeof r.date === "string" && typeof r.shift === "string" && r.hours > 0),
        pay: o.data.pay || {}, bonuses: o.data.bonuses || {} }, `<button class="danger" data-unlink="${esc(o.linkId)}">Unlink</button>`)
    : `<div class="card"><p class="empty">This worker has not synced yet, or your supervisor access is not active.</p><button class="danger" data-unlink="${esc(o.linkId)}">Unlink</button></div>`).join("");
}
function addTeamFiles(files) {
  let added = 0, bad = 0, pending = files.length;
  files.forEach(f => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result).data; if (!validWorker(d)) throw new Error("bad");
        const p = d.pay || {}, key = (d.employee.id || "") + "|" + (d.employee.name || "");
        const w = { key, employee: { name: String(d.employee.name || ""), id: String(d.employee.id || "") },
          records: d.records.map(r => ({ date: r.date, shift: r.shift, hours: Number(r.hours) })),
          pay: { basic: num(p.basic), rate: num(p.rate), nightBill: num(p.nightBill), currency: String(p.currency || "Tk").slice(0, 6) }, bonuses: d.bonuses || {} };
        const idx = team.findIndex(t => t.key === key); if (idx >= 0) team[idx] = w; else team.push(w); added++;
      } catch (e) { bad++; }
      if (--pending === 0) { saveTeam(); renderTeam(); toast(`${added} added${bad ? ", " + bad + " invalid file" + (bad === 1 ? "" : "s") : ""}.`); }
    };
    rd.readAsText(f);
  });
}
async function shareApp() {
  const url = location.href.split("?")[0].split("#")[0], text = "Track your overtime and pay with LINKON:";
  try { if (navigator.share) await navigator.share({ title: "LINKON", text, url }); else { await navigator.clipboard.writeText(text + " " + url); toast("Link copied."); } }
  catch (err) { /* share cancelled */ }
}
// ---- Online account (optional; loaded only when needed so the app still works offline)
async function loadCloud() {
  if (cloud) return cloud;
  const mod = await import("./cloud.js");   // fails when offline
  cloud = mod;
  cloud.onUser(u => {
    cloudUser = u; renderAccount();
    if (u) { localStorage.setItem(CLOUD_FLAG, "1"); firstSync(); checkSupervisor(true); }
    else { syncReady = false; supActive = null; onlineWorkers = []; renderSupervisor(); }
  });
  return cloud;
}
const authError = e => ({ "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.", "auth/user-not-found": "No account with that email.",
  "auth/email-already-in-use": "That email already has an account. Tap Sign in.", "auth/weak-password": "Use a password with 6 or more characters.",
  "auth/invalid-email": "That email address is not valid.", "auth/network-request-failed": "No internet connection.",
  "auth/operation-not-allowed": "Email sign-in is not turned on in Firebase yet.", "auth/unauthorized-domain": "This website is not in Firebase's authorized domains.",
  "auth/too-many-requests": "Too many tries. Wait a little and try again." }[e && e.code] || "Could not complete that. Check your internet and try again.");
async function doAuth(kind) {
  const email = $("acctEmailIn").value.trim(), pass = $("acctPass").value;
  if (!email || pass.length < 6) return toast("Enter your email and a password of 6+ characters.");
  if (kind === "up" && !confirm("Your overtime records and pay settings will be saved online in your private account. Continue?")) return;
  try { const c = await loadCloud(); kind === "up" ? await c.signUp(email, pass) : await c.signIn(email, pass); $("acctPass").value = ""; }
  catch (e) { toast(e && e.code ? authError(e) : "Could not reach the online service. Check your internet."); }
}
const myPayload = () => ({ name: state.employee.name, empId: state.employee.id,
  records: state.records.map(r => ({ id: r.id, date: r.date, shift: r.shift, hours: r.hours })), pay: state.pay, bonuses: state.bonuses,
  settings: { day: state.settings.day, night: state.settings.night, fri1: state.settings.fri1, fri2: state.settings.fri2 } });
async function pushNow() {
  if (!cloud || !cloudUser) return;
  try { await cloud.pushWorker(myPayload()); $("syncInfo").textContent = "Last synced: " + new Date().toLocaleString("en-GB"); }
  catch (e) { $("syncInfo").textContent = "Sync failed. It will retry the next time you save."; }
}
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 2500); }
function applyCloud(d) {
  const p = d.pay || {}, s = d.settings || {};
  state.records = (d.records || []).filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.shift === "string" && r.hours > 0)
    .map(r => ({ id: String(r.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), date: r.date, shift: r.shift, hours: Number(r.hours) }));
  state.employee = { name: String(d.name || ""), id: String(d.empId || "") };
  state.pay = { basic: num(p.basic), rate: num(p.rate), nightBill: num(p.nightBill), currency: String(p.currency || "Tk").slice(0, 6) };
  state.bonuses = d.bonuses || {};
  ["day", "night", "fri1", "fri2"].forEach(k => { if (num(s[k]) > 0) state.settings[k] = num(s[k]); });
  save(); init(); toast("Restored from your online backup.");
}
function showCode(code) { $("myCode").textContent = code; $("myCodeRow").hidden = false; $("codeGet").hidden = true; }
async function firstSync() {
  syncReady = false;
  try {
    const d = await cloud.getMyWorker(), local = state.records.length;
    if (d && d.shareCode) showCode(d.shareCode);
    if (d && Array.isArray(d.records) && d.records.length) {
      if (local === 0 || confirm(`Online backup has ${d.records.length} records; this phone has ${local}.\nOK = use the online backup (replaces this phone's data).\nCancel = keep this phone's data and replace the online backup.`)) applyCloud(d);
      else await pushNow();
    } else await pushNow();
    syncReady = true;
  } catch (e) { $("syncInfo").textContent = "Could not reach your online backup."; }
}
function renderAccount() {
  $("acctOut").hidden = !!cloudUser; $("acctIn").hidden = !cloudUser;
  if (cloudUser) $("acctEmail").textContent = cloudUser.email || "";
  else { $("myCodeRow").hidden = true; $("codeGet").hidden = false; }
  renderSupervisor();
}
function renderSupervisor() {
  $("supMsg").hidden = !!cloudUser; $("supBox").hidden = !cloudUser;
  if (!cloudUser) { renderOnline(); return; }
  $("supUid").textContent = cloudUser.uid;
  $("supPay").hidden = supActive !== false; $("supActive").hidden = supActive !== true;
  if (supActive === false) $("supPay").innerHTML = `<p>Supervisor access is not active. You only need it if you want to view other workers' records.</p>
    <p>To get it, send the subscription${cloud.SUPERVISOR_PRICE ? " (" + esc(cloud.SUPERVISOR_PRICE) + ")" : ""} by bKash${cloud.BKASH_NUMBER ? " to <b>" + esc(cloud.BKASH_NUMBER) + "</b>" : ""}, then send your supervisor ID above. After it is checked, access is switched on. Tap Check status.</p>`;
}
async function checkSupervisor(quiet) {
  try { const c = await loadCloud(); supActive = await c.isSupervisor(); } catch (e) { supActive = null; if (!quiet) toast("Could not check. Check your internet."); }
  renderSupervisor(); if (supActive) loadOnline();
}
async function loadOnline() {
  try { onlineWorkers = await cloud.listWorkers(); } catch (e) { toast("Could not load workers."); }
  renderOnline();
}
async function addByCode() {
  const code = $("supCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 8) return toast("Enter the 8-character code.");
  try { await cloud.linkWorker(code); $("supCode").value = ""; toast("Worker linked."); loadOnline(); }
  catch (e) { toast(e.message === "nocode" ? "Code not found." : e.message === "self" ? "That is your own code." : "Could not link. Check the code and your internet."); }
}
async function shareText(title, text) {
  try { if (navigator.share) await navigator.share({ title, text }); else { await navigator.clipboard.writeText(text); toast("Copied."); } } catch (err) { /* cancelled */ }
}
function countUp(el, to) {
  const from = parseFloat(el.dataset.v || "0") || 0; el.dataset.v = to;
  if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function step(t) { const k = Math.min(1, (t - t0) / 700), ease = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * ease); if (k < 1) requestAnimationFrame(step); })(t0);
}
const textOrig = new WeakMap();
function translateDom() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && !["SCRIPT", "STYLE"].includes(n.parentElement.tagName) && !n.parentElement.closest("#langBtn")) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    if (!textOrig.has(n)) textOrig.set(n, n.nodeValue);
    const o = textOrig.get(n), k = o.trim();
    n.nodeValue = (lang() === "bn" && k && BN[k]) ? o.replace(k, BN[k]) : o;
  });
}
function applyLang() {
  document.documentElement.lang = lang() === "bn" ? "bn" : "en";
  $("langBtn").textContent = lang() === "bn" ? "English" : "বাংলা";
  translateDom(); renderShiftSelect(); render(); fillPay();
}
function renderAvatar() { const src = state.avatar || "profile.jpg"; $("avatarTop").src = src; $("avatarBig").src = src; }
function handleAvatarFile(file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement("canvas"), s = Math.min(img.width, img.height); c.width = c.height = 256;
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    state.avatar = c.toDataURL("image/jpeg", 0.85); URL.revokeObjectURL(url); save(); renderAvatar(); toast("Profile picture updated.");
  };
  img.onerror = () => toast("Could not read that image.");
  img.src = url;
}
function render() { renderAvatar(); renderTeam(); renderPay(); renderSummary(); renderDayGrid(); renderRecords(); }

function resetForm() {
  editingId = null; $("formTitle").textContent = "Add OT record"; $("addBtn").textContent = "ADD OT RECORD";
  $("cancelEdit").hidden = true; $("recShift").value = "day"; onShiftChange();
}
function submitRecord() {
  const date = $("recDate").value, shift = $("recShift").value, hours = parseFloat($("recHours").value);
  if (!date) return toast("Choose a date.");
  if (!(hours > 0) || hours > 24 * 7) return toast("Enter OT hours greater than zero.");
  const dup = state.records.some(r => r.date === date && r.shift === shift && r.id !== editingId);
  if (dup && !confirm("A record with this date and shift already exists. Add anyway?")) return;
  if (editingId) Object.assign(state.records.find(r => r.id === editingId), { date, shift, hours });
  else state.records.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, shift, hours });
  state.month = date.slice(0, 7); $("monthPicker").value = state.month; fillPay();
  save(); resetForm(); render(); toast(editingId ? "Record updated." : "Record added.");
}
function startEdit(id) {
  const r = state.records.find(x => x.id === id); if (!r) return;
  editingId = id; $("recDate").value = r.date; $("recShift").value = r.shift; onShiftChange();
  $("recHours").value = r.hours; $("recHours").readOnly = false;
  $("formTitle").textContent = "Edit OT record"; $("addBtn").textContent = "SAVE CHANGES"; $("cancelEdit").hidden = false;
  showTab("home"); window.scrollTo(0, 0);
}
function showTab(name) {
  document.querySelectorAll("section[data-tab]").forEach(s => s.hidden = s.dataset.tab !== name);
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.go === name));
}
function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; }
function fillSettings() {
  const s = state.settings;
  $("setDay").value = s.day; $("setNight").value = s.night; $("setFri1").value = s.fri1; $("setFri2").value = s.fri2; $("setTheme").value = s.theme; $("setLang").value = s.lang || "en";
}
function saveSettings() {
  const vals = ["setDay", "setNight", "setFri1", "setFri2"].map(i => parseFloat($(i).value));
  if (vals.some(v => !(v > 0))) return toast("Every rule needs hours greater than zero.");
  state.settings = { day: vals[0], night: vals[1], fri1: vals[2], fri2: vals[3], theme: $("setTheme").value, lang: $("setLang").value };
  save(); applyTheme(); applyLang(); toast("Settings saved. Existing records keep their hours.");
}
function exportData() {
  const blob = new Blob([JSON.stringify({ app: "PakizaOT", version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `linkon-ot-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result).data;
      const ok = d && Array.isArray(d.records) && d.records.every(r => r && r.id && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.shift === "string" && r.hours > 0);
      if (!ok) throw new Error("bad");
      if (!confirm(tf(`Replace all current data with ${d.records.length} records from this backup?`, `বর্তমান সব ডেটা বদলে এই ব্যাকআপের ${d.records.length}টি রেকর্ড বসাবেন?`))) return;
      const fresh = load();
      state = { ...fresh, ...d, employee: { ...fresh.employee, ...d.employee }, settings: { ...DEFAULT_SETTINGS, ...d.settings },
        pay: { ...fresh.pay, ...d.pay }, bonuses: d.bonuses || {}, avatar: d.avatar || "" };
      if (!/^\d{4}-\d{2}$/.test(state.month)) state.month = fresh.month;
      save(); init(); toast("Backup restored.");
    } catch (e) { toast("Invalid backup file. Nothing was changed."); }
  };
  reader.readAsText(file);
}

function init() {
  applyTheme(); fillSettings(); renderShiftSelect();
  $("empName").value = state.employee.name; $("empId").value = state.employee.id;
  $("monthPicker").value = state.month; render(); fillPay();
}
document.addEventListener("DOMContentLoaded", () => {
  $("builder").textContent = APP_BUILDER;
  $("recDate").value = new Date().toISOString().slice(0, 10);
  init();
  $("recShift").onchange = onShiftChange;
  $("addBtn").onclick = submitRecord; $("cancelEdit").onclick = resetForm;
  $("monthPicker").onchange = e => { if (e.target.value) { state.month = e.target.value; save(); render(); fillPay(); } };
  $("saveEmp").onclick = () => {
    const name = $("empName").value.trim(); if (!name) return toast("Employee name cannot be blank.");
    state.employee = { name, id: $("empId").value.trim() }; save(); render(); toast("Employee saved.");
  };
  $("recordList").onclick = e => {
    if (e.target.dataset.edit) startEdit(e.target.dataset.edit);
    if (e.target.dataset.del && confirm("Delete this OT record?")) {
      state.records = state.records.filter(r => r.id !== e.target.dataset.del); save(); render();
    }
  };
  $("clearMonth").onclick = () => {
    if (!monthRecords().length) return toast("Nothing to delete this month.");
    if (confirm(tf(`Delete all OT records for ${monthName(state.month)}?`, `${monthName(state.month)} মাসের সব ওটি রেকর্ড মুছবেন?`))) {
      state.records = state.records.filter(r => !r.date.startsWith(state.month)); save(); render();
    }
  };
  ["payBasic", "payRate", "payNight", "payCur", "bonusAtt", "bonusAtd"].forEach(i => $(i).oninput = readPay);
  $("acctSignIn").onclick = () => doAuth("in"); $("acctSignUp").onclick = () => doAuth("up");
  $("acctReset").onclick = async () => { const email = $("acctEmailIn").value.trim(); if (!email) return toast("Type your email first.");
    try { const c = await loadCloud(); await c.resetPassword(email); toast("Password reset email sent."); } catch (e) { toast(authError(e)); } };
  $("acctSync").onclick = async () => { await pushNow(); toast("Sync finished."); };
  $("acctOutBtn").onclick = async () => { try { await cloud.logOut(); } catch (e) { /* ignore */ } localStorage.removeItem(CLOUD_FLAG); toast("Signed out."); };
  $("codeGet").onclick = async () => { try { await pushNow(); showCode(await cloud.ensureCode()); } catch (e) { toast("Could not get a code. Check your internet."); } };
  $("codeShare").onclick = () => shareText("LINKON share code", "My LINKON share code: " + $("myCode").textContent);
  $("codeStop").onclick = async () => { if (!confirm("Stop sharing? Supervisors will lose access to your records.")) return;
    try { await cloud.stopSharing(); $("myCodeRow").hidden = true; $("codeGet").hidden = false; toast("Sharing stopped."); } catch (e) { toast("Could not stop. Check your internet."); } };
  $("supIdShare").onclick = () => shareText("LINKON supervisor ID", "My LINKON supervisor ID: " + $("supUid").textContent);
  $("supCheck").onclick = () => checkSupervisor(false); $("supAdd").onclick = addByCode; $("supRefresh").onclick = loadOnline;
  $("onlineList").onclick = async e => { const id = e.target.dataset.unlink; if (id && confirm("Unlink this worker?")) { try { await cloud.unlink(id); loadOnline(); } catch (err) { toast("Could not unlink."); } } };
  if (localStorage.getItem(CLOUD_FLAG) === "1") { const back = () => { if (!cloud) loadCloud().catch(() => {}); }; back(); window.addEventListener("online", back); }
  $("teamAdd").onclick = () => $("teamFile").click();
  $("teamFile").onchange = e => { if (e.target.files.length) addTeamFiles([...e.target.files]); e.target.value = ""; };
  $("teamClear").onclick = () => { if (team.length && confirm("Remove all workers from the team view? Their own phones are not affected.")) { team = []; saveTeam(); renderTeam(); } };
  $("teamList").onclick = e => { const i = e.target.dataset.teamdel; if (i !== undefined && confirm("Remove this worker from the team view?")) { team.splice(Number(i), 1); saveTeam(); renderTeam(); } };
  $("inviteBtn").onclick = shareApp;
  $("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* ignore */ } installEvt = null; $("installBtn").hidden = true; };
  $("slipBtn").onclick = showSlip; $("slipPrint").onclick = () => window.print(); $("slipShare").onclick = shareSlip;
  $("slipClose").onclick = () => { $("slip").hidden = true; document.body.classList.remove("slip-open"); };
  $("avatarBtn").onclick = () => $("avatarFile").click();
  $("avatarFile").onchange = e => { if (e.target.files[0]) handleAvatarFile(e.target.files[0]); e.target.value = ""; };
  $("avatarReset").onclick = () => { state.avatar = ""; save(); renderAvatar(); };
  $("saveSettings").onclick = saveSettings;
  $("resetSettings").onclick = () => { state.settings = { ...DEFAULT_SETTINGS, lang: lang() }; save(); applyTheme(); fillSettings(); renderShiftSelect(); toast("Defaults restored."); };
  $("exportBtn").onclick = exportData;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; };
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.go));
  setTimeout(() => $("splash").classList.add("hide"), 1400);
  $("langBtn").onclick = () => { state.settings.lang = lang() === "bn" ? "en" : "bn"; $("setLang").value = state.settings.lang; save(); applyLang(); };
  applyLang();
  let langQueued = false;
  new MutationObserver(() => { if (langQueued) return; langQueued = true; requestAnimationFrame(() => { langQueued = false; translateDom(); }); }).observe(document.body, { childList: true, subtree: true });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
});
