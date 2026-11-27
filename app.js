const MAX_TURNS = 10, MAX_MISSES = 2, REPLY_SECONDS = 60, DEBOUNCE_MS = 4000;

const NAMES = ["Jake","Ethan","Marcus","Liam","Ryan","Daniel","Noah","Tyler","Chris","Mason","Brian","Kevin","Aaron","Derek","Nick","Owen"];
const JOBS = ["security guard","electrician","nurse","bartender","graphic designer","mechanic","teacher","chef","software tester","delivery driver","paramedic","barista"];
const INTERESTS = ["baking bread","rock climbing","retro video games","fishing","playing guitar","cooking pasta","running","photography","woodworking","collecting vinyl","hiking","brewing coffee"];
const MOODS = ["tired after a long day","playful","flirty","stressed about something","a bit lonely","excited about something"];
const STYLES = ["short lowercase texts","dry humor","warm and chatty","laid back and teasing"];
const SCENARIOS = [
  {intro:"He just finished a double shift and is barely awake.", hint:"He just finished a double shift, is exhausted, and wants to unwind with her."},
  {intro:"He's at his family's house for the holidays and his relatives keep asking if he's seeing anyone.", hint:"He is at his family's place for the holidays, hiding from relatives who keep asking if he's seeing anyone."},
  {intro:"His dog has been sick since yesterday and he's worried.", hint:"His dog has been sick since yesterday and he is worried but trying to act fine."},
  {intro:"He has a trip coming up this weekend and can't stop thinking about it.", hint:"He has a trip this weekend that he is excited and a little nervous about."},
  {intro:"He just started a new gym routine and is sore and kind of proud.", hint:"He just started a new gym routine, is sore, and is proud but a bit shy about it."},
  {intro:"He had an awkward argument with a coworker today and it's still on his mind.", hint:"He had an awkward argument with a coworker today and it is still bugging him."}
];
const THEMES = {
  midnight:{icon:"🌙"}, holiday:{icon:"🎄"}, rose:{icon:"🌹"}, ocean:{icon:"🌊"}, light:{icon:"☀️"}
};
const BULB_COLORS = ["#ff5a5a","#3ddc84","#ffd23f","#7aa8ff","#c77dff","#ff9f43"];

const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let S = null;

/* ---------- THEMES ---------- */
function setTheme(n){
  if (!THEMES[n]) n = "midnight";
  document.body.dataset.theme = n;
  try { localStorage.setItem("gfe-theme", n); } catch(e){}
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.t === n));
  $("dayBadge").textContent = THEMES[n].icon + " Day 7";
}
function initThemes(){
  Object.keys(THEMES).forEach(k => {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.t = k;
    b.textContent = THEMES[k].icon + " " + k[0].toUpperCase() + k.slice(1);
    b.onclick = () => setTheme(k);
    $("themeChips").appendChild(b);
  });
  for (let i = 0; i < 16; i++){
    const s = document.createElement("span");
    s.className = "bulb";
    s.style.color = BULB_COLORS[i % BULB_COLORS.length];
    s.style.setProperty("--d", (i * 0.23) + "s");
    $("lights").appendChild(s);
  }
  let saved = "midnight";
  try { saved = localStorage.getItem("gfe-theme") || "midnight"; } catch(e){}
  setTheme(saved);
}

/* ---------- STATE ---------- */
function newState(name){
  const sc = pick(SCENARIOS);
  const p = {
    name: pick(NAMES), age: 24 + Math.floor(Math.random() * 15),
    job: pick(JOBS), interest: pick(INTERESTS),
    mood: pick(MOODS), style: pick(STYLES), scenario: sc
  };
  return {
    chatter: name, p, facts: [p.job, p.interest],
    msgs: [], log: [], turns: 0, misses: 0, pending: [], replyTo: null,
    debounce: null, tick: null, left: REPLY_SECONDS, busy: false, ended: false
  };
}
function personaString(){
  const p = S.p;
  return "Your name is " + p.name + ", age " + p.age + ". Job: " + p.job + ". You are into " + p.interest + "." +
    " Tonight's situation: " + p.scenario.hint + " Tonight's mood: " + p.mood + "." +
    " Texting style: " + p.style + ". Her name is " + S.chatter + ". Keep all of this consistent." +
    " Facts already known to her: " + S.facts.join(", ") + ".";
}

/* ---------- API ---------- */
async function callWorker(payload){
  const r = await fetch(WORKER_URL, {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error((data.error && data.error.message) || ("Server error " + r.status));
  return data.content.map(c => c.text || "").join("");
}

/* ---------- UI HELPERS ---------- */
function renderKnown(flash){
  $("known").innerHTML = "📝 What you know so far: <b>" + S.facts.map(esc).join("</b> · <b>") + "</b>";
  if (flash) { $("known").classList.remove("new"); void $("known").offsetWidth; $("known").classList.add("new"); }
}
function addFacts(list){
  let added = false;
  list.forEach(f => {
    if (f && !S.facts.some(x => x.toLowerCase() === f.toLowerCase()) && S.facts.length < 6){ S.facts.push(f); added = true; }
  });
  if (added) renderKnown(true);
}
function addBubble(who, text, quote){
  const d = document.createElement("div");
  d.className = "b " + who;
  if (quote){ const q = document.createElement("div"); q.className = "quote"; q.textContent = quote; d.appendChild(q); }
  d.appendChild(document.createTextNode(text));
  if (who === "him"){
    d.onclick = () => {
      S.replyTo = text;
      $("replyTxt").textContent = "Replying to: " + text.slice(0, 60);
      $("replyBar").hidden = false; $("input").focus();
    };
  }
  $("msgs").appendChild(d);
  $("msgs").scrollTop = $("msgs").scrollHeight;
}
function sysNote(t){
  const d = document.createElement("div");
  d.className = "sys"; d.textContent = t;
  $("msgs").appendChild(d); $("msgs").scrollTop = $("msgs").scrollHeight;
}

/* ---------- TIMER ---------- */
function startTimer(){
  clearInterval(S.tick); S.left = REPLY_SECONDS; renderTimer();
  S.tick = setInterval(() => { S.left--; renderTimer(); if (S.left <= 0){ clearInterval(S.tick); onMiss(); } }, 1000);
}
function renderTimer(){ $("timer").textContent = S.left + "s"; $("timer").className = S.left <= 10 ? "low" : ""; }
function stopTimer(){ clearInterval(S.tick); $("timer").textContent = "--"; }

/* ---------- CHAT FLOW ---------- */
async function guyTurn(userContent){
  S.busy = true;
  S.msgs.push({role: "user", content: userContent});
  const typing = document.createElement("div");
  typing.className = "sys"; typing.textContent = S.p.name + " is typing...";
  $("msgs").appendChild(typing); $("msgs").scrollTop = $("msgs").scrollHeight;
  try {
    const raw = await callWorker({mode: "chat", messages: S.msgs, persona: personaString()});
    typing.remove();
    S.msgs.push({role: "assistant", content: raw});
    const found = [];
    const clean = raw.replace(/\[\[FACT:\s*(.*?)\]\]/gi, (m, x) => { found.push(x.trim()); return ""; });
    clean.split("|||").map(t => t.trim()).filter(Boolean).forEach(t => {
      addBubble("him", t); S.log.push({who: S.p.name, text: t});
    });
    addFacts(found);
    S.busy = false;
    if (S.turns >= MAX_TURNS) return finish();
    startTimer();
  } catch (e){
    typing.remove(); sysNote("Error: " + e.message); S.busy = false;
  }
}

function onMiss(){
  if (S.busy || S.ended) return;
  S.misses++; S.turns++;
  $("turnTxt").textContent = "Turn " + S.turns + " / " + MAX_TURNS;
  sysNote("You missed that reply (" + S.misses + "/" + (MAX_MISSES + 1) + ")");
  S.log.push({who: "(" + S.chatter + ")", text: "[NO REPLY - TIMED OUT]"});
  if (S.misses > MAX_MISSES) return finish();
  guyTurn("[She did not reply in time. React like a guy who got left on read for a bit.]");
}

function queueLine(){
  if (S.busy || S.ended) return;
  const raw = $("input").value.trim();
  if (!raw) return;
  $("input").value = "";
  stopTimer();
  const quote = S.replyTo;
  S.replyTo = null; $("replyBar").hidden = true;
  addBubble("her", raw, quote ? "↩ " + quote : null);
  S.pending.push(quote ? '(replying to his message: "' + quote + '") ' + raw : raw);
  S.log.push({who: S.chatter, text: raw});
  clearTimeout(S.debounce);
  S.debounce = setTimeout(flush, DEBOUNCE_MS);
}

function flush(){
  if (!S.pending.length) return;
  const content = S.pending.join("\n");
  S.pending = [];
  S.turns++;
  $("turnTxt").textContent = "Turn " + S.turns + " / " + MAX_TURNS;
  if (S.turns >= MAX_TURNS) return finish();
  guyTurn(content);
}

/* ---------- RESULT ---------- */
async function finish(){
  if (S.ended) return;
  S.ended = true; stopTimer(); clearTimeout(S.debounce); S.pending = [];
  $("chat").hidden = true; $("result").hidden = false;
  $("result").innerHTML = '<h1>Checking your GFE...</h1>';
  const transcript = S.log.map(l => l.who + ": " + l.text).join("\n");
  const failedByMisses = S.misses > MAX_MISSES;
  try {
    const text = await callWorker({
      mode: "score",
      messages: [{role: "user", content: "Trainee chatter name: " + S.chatter + "\nMisses: " + S.misses + "\nTranscript:\n" + transcript}]
    });
    const j = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (failedByMisses) j.verdict = "FAILED";
    renderResult(j);
  } catch (e){
    $("result").innerHTML = '<h1>Could not score</h1><p>' + esc(e.message) + '</p><button class="primary" onclick="location.reload()">Back</button>';
  }
}
function list(arr){ return (arr || []).map(x => "<li>" + esc(x) + "</li>").join(""); }
function renderResult(j){
  const cats = Object.entries(j.categories || {})
    .map(([k, v]) => '<div class="row"><span>' + esc(k.replace(/_/g, " ")) + "</span><b>" + esc(v) + "/10</b></div>").join("");
  const ok = j.verdict === "PASS";
  $("result").innerHTML =
    '<div class="big ' + (ok ? "pass" : "fail") + '">' + esc(j.score) + '</div>' +
    '<h2 style="text-align:center" class="' + (ok ? "pass" : "fail") + '">' + esc(j.verdict) + '</h2>' +
    '<div class="card">' + cats + '</div>' +
    '<div class="card"><b>Hints he dropped</b><ul>' + list(j.hints_he_dropped) + '</ul>' +
    '<b>You caught</b><ul>' + list(j.hints_caught) + '</ul>' +
    '<b>You missed</b><ul>' + list(j.hints_missed) + '</ul></div>' +
    '<div class="card"><b>Best message</b><p>' + esc(j.best_message) + '</p>' +
    '<b>Worst message</b><p>' + esc(j.worst_message) + '</p></div>' +
    '<div class="card"><b>Top fixes</b><ul>' + list(j.top_3_fixes) + '</ul></div>' +
    '<button class="primary" onclick="location.reload()" style="width:100%">Try another guy</button>';
}

/* ---------- START ---------- */
$("startBtn").onclick = () => {
  if (typeof WORKER_URL === "undefined" || WORKER_URL === "PASTE_LATER"){ $("cfgWarn").hidden = false; return; }
  S = newState($("name").value.trim() || "Trainee");
  $("start").hidden = true; $("chat").hidden = false;
  $("guyName").textContent = S.p.name + ", " + S.p.age;
  $("avatar").textContent = S.p.name[0];
  $("msgs").innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "intro";
  intro.textContent = "You've been talking for a week. " + S.p.scenario.intro;
  $("msgs").appendChild(intro);
  setTheme(document.body.dataset.theme);
  renderKnown(false);
  guyTurn("[The chat begins. Send your opening text to her now.]");
};
$("send").onclick = queueLine;
$("input").addEventListener("keydown", e => { if (e.key === "Enter") queueLine(); });
$("replyX").onclick = () => { S.replyTo = null; $("replyBar").hidden = true; };
$("endBtn").onclick = () => { if (confirm("End the chat and get your score?")) finish(); };
$("themeBtn").onclick = () => {
  const keys = Object.keys(THEMES);
  setTheme(keys[(keys.indexOf(document.body.dataset.theme) + 1) % keys.length]);
};
initThemes();
