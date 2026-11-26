const MAX_TURNS = 10, MAX_MISSES = 3, REPLY_SECONDS = 60, DEBOUNCE_MS = 4000;
const NAMES = ["Jake","Ethan","Marcus","Liam","Ryan","Daniel","Noah","Tyler","Chris","Mason"];
const MOODS = ["tired after a long day","playful","flirty","stressed about something","a bit lonely","excited about something"];
const STYLES = ["short lowercase texts","emoji-heavy","dry humor","warm and chatty","laid back and teasing"];

const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let S;

function newState(name){
  return {
    chatter: name, guy: pick(NAMES), msgs: [], log: [],
    turns: 0, misses: 0, pending: [], replyTo: null,
    debounce: null, tick: null, left: REPLY_SECONDS, busy: false, ended: false
  };
}

async function callWorker(payload){
  const r = await fetch(WORKER_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("Server error " + r.status);
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "API error");
  return data.content.map(c => c.text || "").join("");
}

function addBubble(who, text, quote){
  const d = document.createElement("div");
  d.className = "b " + who;
  if (quote){
    const q = document.createElement("div");
    q.className = "quote"; q.textContent = quote; d.appendChild(q);
  }
  d.appendChild(document.createTextNode(text));
  if (who === "him"){
    d.onclick = () => {
      S.replyTo = text;
      $("replyTxt").textContent = "Replying to: " + text.slice(0, 60);
      $("replyBar").hidden = false;
      $("input").focus();
    };
  }
  $("msgs").appendChild(d);
  $("msgs").scrollTop = $("msgs").scrollHeight;
}

function sysNote(t){
  const d = document.createElement("div");
  d.className = "sys"; d.textContent = t;
  $("msgs").appendChild(d);
  $("msgs").scrollTop = $("msgs").scrollHeight;
}

function startTimer(){
  clearInterval(S.tick);
  S.left = REPLY_SECONDS;
  renderTimer();
  S.tick = setInterval(() => {
    S.left--;
    renderTimer();
    if (S.left <= 0){ clearInterval(S.tick); onMiss(); }
  }, 1000);
}
function renderTimer(){
  $("timer").textContent = S.left + "s";
  $("timer").className = S.left <= 10 ? "low" : "";
}
function stopTimer(){ clearInterval(S.tick); $("timer").textContent = "--"; }

async function guyTurn(userContent){
  S.busy = true;
  S.msgs.push({role: "user", content: userContent});
  const typing = document.createElement("div");
  typing.className = "sys"; typing.textContent = S.guy + " is typing...";
  $("msgs").appendChild(typing);
  try {
    const persona = "Your name is " + S.guy + ". Tonight's mood: " + S.mood +
                    ". Texting style: " + S.style + ". Her name is " + S.chatter + ".";
    const text = await callWorker({mode: "chat", messages: S.msgs, persona});
    typing.remove();
    S.msgs.push({role: "assistant", content: text});
    text.split("|||").map(t => t.trim()).filter(Boolean).forEach(t => {
      addBubble("him", t);
      S.log.push({who: S.guy, text: t});
    });
    S.busy = false;
    if (S.turns >= MAX_TURNS) return finish();
    startTimer();
  } catch (e){
    typing.remove();
    sysNote("Error: " + e.message);
    S.busy = false;
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

async function finish(){
  if (S.ended) return;
  S.ended = true;
  stopTimer(); clearTimeout(S.debounce);
  if (S.pending.length) S.pending = [];
  $("chat").hidden = true;
  $("result").hidden = false;
  $("result").innerHTML = '<h1>Checking your GFE...</h1>';
  const transcript = S.log.map(l => l.who + ": " + l.text).join("\n");
  const failedByMisses = S.misses > MAX_MISSES;
  try {
    const text = await callWorker({
      mode: "score",
      messages: [{role: "user", content:
        "Trainee chatter name: " + S.chatter + "\nMisses: " + S.misses +
        "\nTranscript:\n" + transcript}]
    });
    const j = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (failedByMisses) j.verdict = "FAILED";
    renderResult(j);
  } catch (e){
    $("result").innerHTML = '<h1>Could not score</h1><p>' + esc(e.message) + '</p><button onclick="location.reload()">Back</button>';
  }
}

function list(arr){ return (arr || []).map(x => "<li>" + esc(x) + "</li>").join(""); }

function renderResult(j){
  const cats = Object.entries(j.categories || {})
    .map(([k, v]) => '<div class="row"><span>' + esc(k.replace(/_/g, " ")) + "</span><b>" + esc(v) + "/10</b></div>").join("");
  $("result").innerHTML =
    '<div class="big ' + (j.verdict === "PASS" ? "pass" : "fail") + '">' + esc(j.score) + '</div>' +
    '<h2 style="text-align:center" class="' + (j.verdict === "PASS" ? "pass" : "fail") + '">' + esc(j.verdict) + '</h2>' +
    '<div class="card">' + cats + '</div>' +
    '<div class="card"><b>Hints he dropped</b><ul>' + list(j.hints_he_dropped) + '</ul>' +
    '<b>You caught</b><ul>' + list(j.hints_caught) + '</ul>' +
    '<b>You missed</b><ul>' + list(j.hints_missed) + '</ul></div>' +
    '<div class="card"><b>Best message</b><p>' + esc(j.best_message) + '</p>' +
    '<b>Worst message</b><p>' + esc(j.worst_message) + '</p></div>' +
    '<div class="card"><b>Top fixes</b><ul>' + list(j.top_3_fixes) + '</ul></div>' +
    '<button onclick="location.reload()" style="width:100%">Try another guy</button>';
}

$("startBtn").onclick = () => {
  if (typeof WORKER_URL === "undefined" || WORKER_URL === "PASTE_LATER"){
    $("cfgWarn").hidden = false; return;
  }
  const name = $("name").value.trim() || "Trainee";
  S = newState(name);
  S.mood = pick(MOODS); S.style = pick(STYLES);
  $("start").hidden = true; $("chat").hidden = false;
  $("guyName").textContent = S.guy;
  $("avatar").textContent = S.guy[0];
  guyTurn("[The chat begins. Send your opening text to her now.]");
};
$("send").onclick = queueLine;
$("input").addEventListener("keydown", e => { if (e.key === "Enter") queueLine(); });
$("replyX").onclick = () => { S.replyTo = null; $("replyBar").hidden = true; };
$("endBtn").onclick = () => { if (confirm("End the chat and get your score?")) finish(); };
