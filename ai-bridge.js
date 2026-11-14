// walow game — جسر الذكاء الاصطناعي (Gemini) + إدارة المشروع
let base64Image = null;
let busy = false;
let engineReady = false;
let engineProblem = 'المحرك ثلاثي الأبعاد لم يعمل بعد.';
const BRIDGE_VERSION = '2';
const history = [];
const recentErrors = [];
const LS = {
  key: 'walow_gemini_key',
  model: 'walow_gemini_model_manual', // يدوي فقط (القيمة التلقائية القديمة تُتجاهل)
  project: 'walow_project_v1',
};
const API = 'https://generativelanguage.googleapis.com/v1beta';

const SYSTEM_PROMPT = `أنت مساعد داخل محرك ألعاب ثلاثي الأبعاد اسمه "walow game" يعمل على جوال أندرويد. أجب بالعربية وباختصار ووضوح.

عندما يطلب المستخدم بناء أو تعديل شيء في اللعبة: اكتب كود JavaScript داخل كتلة \`\`\`js واحدة فقط. الكود يُنفَّذ تلقائياً داخل المحرك ويُضاف إلى المشهد الحالي دون مسحه (إلا إذا استدعيت engine.reset()). المتغيرات المتاحة: engine, THREE, CANNON. الكود يدعم await. الوحدات بالأمتار، المحور y للأعلى، والأرض عند y=0.
إذا كان السؤال معلومة عن اللعبة فقط، أجب من "حالة اللعبة الحالية" المرسلة لك دون كود. لا تخترع كائنات غير موجودة في الحالة.
إذا أُرسلت صورة فيها خطأ أو كود، اقرأها واشرح المشكلة بإيجاز ثم أصلحها بكود.
عند تعديل شيء موجود استخدم engine.update/remove بنفس اسمه، ولا تعد بناء المشهد كله لتعديل صغير.

واجهة المحرك (engine):
- engine.add({type, name, color, position:[x,y,z], size:number|[x,y,z], rotation:[rx,ry,rz], physics:'none'|'static'|'dynamic', mass, texture, emissive, opacity, metalness, roughness}) → الاسم. الأنواع: box, sphere, cylinder, cone, plane, torus, capsule. الحجم 1 يعني متراً واحداً. المركز عند position.
- engine.update(name, {position, rotation, size, color, emissive, opacity, visible, velocity})
- engine.remove(name) ، engine.get(name) → {mesh, body}
- engine.player({position, color, speed, jump}) → لاعب بالعصا واللمس والقفز (الاسم 'player')
- engine.collide(nameA, nameB, (e)=>{}) → عند تصادم جسمين لهما physics
- engine.onUpdate((dt)=>{}) → يعمل كل إطار (حركة، منطق اللعبة)
- engine.hud(text) → نص فوق الشاشة (للنقاط). engine.hud(null) يخفيه
- engine.setEnvironment({sky, fog:[near,far], ground:{color, size, visible}, sun:{intensity,color,position}, ambient, gravity})
- engine.imageTo3D(dataURLأوURL, {mode:'relief'|'standee'|'voxel', width, depth, position, physics}) → async
- engine.reset() يمسح كل شيء. engine.focus(name)
أمثلة منطق: أضف عملات كمكعبات، واستخدم engine.collide('player', coinName, ()=>{ engine.remove(coinName); score++; engine.hud('النقاط: '+score); }).
اجعل الأجسام الثابتة (أرضيات، جدران، منصات) physics:'static' والمتحركة 'dynamic'. استخدم ألواناً جميلة ومتناسقة.`;

// ---------- المفتاح والإعدادات ----------
function getApiKey() {
  try {
    const k = localStorage.getItem(LS.key);
    if (k && k.trim()) return k.trim();
    const f = document.getElementById('api-key-input');
    if (f && f.value.trim()) { localStorage.setItem(LS.key, f.value.trim()); return f.value.trim(); }
  } catch (_) {}
  return '';
}

function openSettings() {
  let m = document.getElementById('settings-modal');
  if (m) { m.style.display = 'flex'; return; }
  m = document.createElement('div');
  m.id = 'settings-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML = `
    <div style="background:#1c1c1c;border:1px solid #333;border-radius:12px;padding:16px;width:100%;max-width:380px;color:#eee;font-family:Tahoma,sans-serif;direction:rtl">
      <h3 style="margin:0 0 10px">إعدادات الذكاء الاصطناعي</h3>
      <label style="font-size:12px;color:#aaa">مفتاح Gemini API</label>
      <input type="password" id="api-key-input" style="width:100%;padding:9px;margin:4px 0 10px;border-radius:6px;border:none;background:#2d2d2d;color:#fff;direction:ltr" />
      <label style="font-size:12px;color:#aaa">اسم النموذج (اتركه فارغاً للاختيار التلقائي)</label>
      <input type="text" id="model-input" placeholder="تلقائي" style="width:100%;padding:9px;margin:4px 0 10px;border-radius:6px;border:none;background:#2d2d2d;color:#fff;direction:ltr" />
      <div style="font-size:11px;color:#888;margin-bottom:12px">المفتاح يُحفظ في متصفحك فقط ولا يُرسل إلا إلى Google. لا تشاركه مع أحد.</div>
      <div style="display:flex;gap:8px">
        <button id="settings-save" style="flex:1;padding:10px;background:#00ffcc;border:none;border-radius:6px;font-weight:bold;color:#000">حفظ</button>
        <button id="settings-close" style="flex:1;padding:10px;background:#333;border:none;border-radius:6px;color:#fff">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const keyEl = m.querySelector('#api-key-input'), modEl = m.querySelector('#model-input');
  try { keyEl.value = localStorage.getItem(LS.key) || ''; modEl.value = localStorage.getItem(LS.model) || ''; } catch (_) {}
  m.querySelector('#settings-close').onclick = () => { m.style.display = 'none'; };
  m.querySelector('#settings-save').onclick = () => {
    const k = keyEl.value.trim(), md = modEl.value.trim();
    if (!k) { alert('الرجاء إدخال مفتاح صحيح أولاً.'); return; }
    try { localStorage.setItem(LS.key, k); if (md) localStorage.setItem(LS.model, md); else localStorage.removeItem(LS.model); } catch (_) {}
    m.style.display = 'none';
    appendMessage('تم حفظ الإعدادات. يمكنك الآن إعطاء الأوامر للمحرك.', 'ai');
  };
}

// قائمة نماذج flash المتاحة لمفتاحك، الأحدث أولاً (تُجلب مرة لكل جلسة)
let modelPool = null;
async function getModelPool(key) {
  if (modelPool) return modelPool;
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new Error(await explainHttp(r));
  const names = ((await r.json()).models || [])
    .filter((x) => (x.supportedGenerationMethods || []).includes('generateContent'))
    .map((x) => x.name.replace('models/', ''));
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const bad = /image|tts|audio|live|robotics|computer|embed|thinking|learnlm|gemma/i;
  const byVer = (arr) => arr.sort((x, y) => ver(y) - ver(x));
  const stable = byVer(names.filter((n) => /^gemini-[\d.]+-flash(-\d+)?$/.test(n)));
  const other = byVer(names.filter((n) => /flash/.test(n) && !bad.test(n) && !/lite/.test(n) && !stable.includes(n)));
  const lite = byVer(names.filter((n) => /flash-lite/.test(n) && !bad.test(n)));
  const pool = [...new Set([...stable, ...other, ...lite])];
  if (!pool.length) throw new Error('لم أجد نموذجاً مناسباً لمفتاحك. اكتب اسم النموذج يدوياً من الإعدادات.');
  modelPool = pool;
  return pool;
}

async function explainHttp(r) {
  let t = '';
  try { t = (await r.json())?.error?.message || ''; } catch (_) {}
  if (r.status === 400 && /API key/i.test(t)) return 'المفتاح غير صالح. راجع الإعدادات.';
  if (r.status === 403) return 'المفتاح مرفوض أو لا يملك صلاحية. ' + t;
  if (r.status === 429) return 'تجاوزت حد الاستخدام المجاني لـ Gemini. انتظر قليلاً ثم أعد المحاولة.';
  return `خطأ من Gemini (${r.status}). ${t}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// يحاول عند ضغط الخوادم (5xx)، ويجرب نموذجاً بديلاً عند انتهاء الحصة (429) أو غياب النموذج (404)
async function callGemini(parts, onStatus) {
  const key = getApiKey();
  let manual = '';
  try { manual = localStorage.getItem(LS.model) || ''; } catch (_) {}
  const models = manual ? [manual] : (await getModelPool(key)).slice(0, 3);
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...history.slice(-10), { role: 'user', parts }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
  });
  let lastErr;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 0; attempt < 3; attempt++) {
      let r;
      try {
        r = await fetch(`${API}/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: payload,
        });
      } catch (e) {
        lastErr = new Error('تعذر الاتصال بالإنترنت. تأكد من الشبكة.');
        await sleep(1500);
        continue;
      }
      if (r.ok) {
        const j = await r.json();
        const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (!text) throw new Error('لم يرجع النموذج جواباً' + (j.promptFeedback?.blockReason ? ` (${j.promptFeedback.blockReason})` : '') + '.');
        return text;
      }
      lastErr = new Error(await explainHttp(r));
      if ([500, 502, 503, 504].includes(r.status)) {
        if (attempt < 2) {
          if (onStatus) onStatus(`Gemini مشغول حالياً، أعيد المحاولة… (${attempt + 2}/3)`);
          await sleep(1500 * (attempt + 1));
          continue;
        }
        break;
      }
      if (r.status === 429 || r.status === 404) break;
      throw lastErr; // مفتاح خاطئ أو طلب مرفوض: لا فائدة من التكرار
    }
    if (mi < models.length - 1 && onStatus) onStatus('أجرّب نموذجاً بديلاً…');
  }
  throw lastErr || new Error('فشل الاتصال بـ Gemini.');
}

// ---------- المشروع (الأكواد المنفذة تُحفظ وتُعاد عند فتح التطبيق) ----------
function loadProject() { try { return JSON.parse(localStorage.getItem(LS.project)) || { snippets: [] }; } catch (_) { return { snippets: [] }; } }
function saveProject(p) { try { localStorage.setItem(LS.project, JSON.stringify(p)); } catch (_) {} }
let project = loadProject();

async function rebuild() {
  WalowEngine.reset();
  for (const s of project.snippets) { try { await WalowEngine.run(s); } catch (e) { console.warn('snippet failed', e); } }
}

const STARTER = `
engine.setEnvironment({ sky: '#9fd8ff' });
engine.add({ type:'box', name:'منصة', color:'#8d6e63', position:[0,0.5,-6], size:[6,1,6], physics:'static' });
engine.add({ type:'box', name:'درج', color:'#a1887f', position:[0,1.5,-6], size:[3,1,3], physics:'static' });
for (let i = 0; i < 5; i++) engine.add({ type:'box', name:'صندوق'+i, color:['#ef5350','#42a5f5','#ffca28','#66bb6a','#ab47bc'][i], position:[-3+i*1.5,0.5+i*0.0,3], size:1, physics:'dynamic' });
engine.add({ type:'sphere', name:'كرة', color:'#ffffff', position:[4,1,0], size:1.2, physics:'dynamic', mass:0.6 });
engine.player({ position:[0,1.5,0], color:'#ff7a18' });
engine.hud('اسحب الشاشة لتدوير الكاميرا');
`;

// ---------- الدردشة ----------
function appendMessage(text, sender) {
  const box = document.getElementById('chat-messages');
  if (!box) return null;
  const d = document.createElement('div');
  d.className = `msg ${sender}`;
  d.innerText = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

function appendCode(code) {
  const box = document.getElementById('chat-messages');
  const det = document.createElement('details');
  det.className = 'msg ai';
  const sm = document.createElement('summary');
  sm.textContent = 'عرض الكود الذي نُفِّذ';
  const pre = document.createElement('pre');
  pre.style.cssText = 'direction:ltr;text-align:left;white-space:pre-wrap;font-size:11px;margin:6px 0 0;color:#9fe';
  pre.textContent = code;
  det.append(sm, pre);
  box.appendChild(det);
  box.scrollTop = box.scrollHeight;
}

function extractCode(text) {
  const re = /```(?:js|javascript)?\s*\n([\s\S]*?)```/g;
  const codes = [];
  let m;
  while ((m = re.exec(text))) codes.push(m[1]);
  return { code: codes.join('\n'), prose: text.replace(re, '').trim() };
}

function sceneContext(extraErrors) {
  let s;
  try { s = 'حالة اللعبة الحالية (JSON):\n' + JSON.stringify(WalowEngine.getState()); }
  catch (e) { s = 'تعذر قراءة حالة اللعبة: ' + (e && e.message || e); }
  const errs = (extraErrors || recentErrors).slice(-3);
  if (errs.length) s += '\nأخطاء حديثة في وقت التشغيل:\n- ' + errs.join('\n- ');
  return s;
}

async function applyCode(code, depth = 0) {
  try {
    await WalowEngine.run(code);
    project.snippets.push(code);
    saveProject(project);
    return true;
  } catch (e) {
    const msg = String(e && e.message || e);
    appendMessage('⚠️ فشل تنفيذ الكود: ' + msg, 'ai');
    if (depth >= 2) { appendMessage('توقفت عن المحاولة التلقائية. صف لي المشكلة أو أرسل لقطة شاشة.', 'ai'); return false; }
    appendMessage('أحاول إصلاحه تلقائياً…', 'ai');
    const fixText = `الكود التالي سبب الخطأ: ${msg}\nأصلحه وأعد الكود كاملاً في كتلة js واحدة.\n\`\`\`js\n${code}\n\`\`\``;
    const reply = await callGemini([{ text: fixText + '\n\n' + sceneContext([msg]) }]);
    history.push({ role: 'user', parts: [{ text: fixText }] }, { role: 'model', parts: [{ text: reply }] });
    const { code: c2, prose } = extractCode(reply);
    if (prose) appendMessage(prose, 'ai');
    if (c2) { appendCode(c2); return applyCode(c2, depth + 1); }
    return false;
  }
}

async function handleUserSubmit() {
  if (busy) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text && !base64Image) return;
  if (!getApiKey()) {
    appendMessage('⚠️ أدخل مفتاح Gemini أولاً: اضغط زر ⚙️ أعلى الشاشة ثم الصق المفتاح واضغط حفظ.', 'ai');
    openSettings();
    return;
  }
  if (!engineReady) { appendMessage('⚠️ ' + engineProblem, 'ai'); return; }
  busy = true;
  appendMessage(text || '(صورة)', 'user');
  input.value = '';
  const parts = [{ text: (text || 'حلّل هذه الصورة وساعدني بها.') + '\n\n' + sceneContext() }];
  if (base64Image) {
    const m = base64Image.match(/^data:(.+?);base64,(.*)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  const shareView = document.getElementById('share-view');
  if (shareView && shareView.checked) {
    try { parts.push({ inlineData: { mimeType: 'image/jpeg', data: WalowEngine.screenshot().split(',')[1] } }); parts[0].text += '\n(مرفق لقطة من شاشة اللعبة الحالية)'; } catch (_) {}
  }
  clearImage();
  const wait = appendMessage('…', 'ai');
  try {
    const reply = await callGemini(parts, (t) => { if (wait) wait.innerText = t; });
    history.push({ role: 'user', parts: [{ text: text || '(صورة)' }] }, { role: 'model', parts: [{ text: reply }] });
    wait.remove();
    const { code, prose } = extractCode(reply);
    if (prose) appendMessage(prose, 'ai');
    if (code) { appendCode(code); await applyCode(code); }
  } catch (e) {
    wait.remove();
    appendMessage('⚠️ ' + (e.message || e), 'ai');
  } finally {
    busy = false;
  }
}

// ---------- الصور ----------
function handleImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    // تصغير صور الكاميرا الكبيرة لتسريع الإرسال والمعالجة
    const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    base64Image = c.toDataURL('image/jpeg', 0.88);
    URL.revokeObjectURL(url);
    const preview = document.getElementById('upload-preview'), box = document.getElementById('preview-box');
    if (preview) preview.src = base64Image;
    if (box) box.style.display = 'flex';
  };
  img.onerror = () => { URL.revokeObjectURL(url); appendMessage('تعذر قراءة الصورة.', 'ai'); };
  img.src = url;
  event.target.value = '';
}

function clearImage() {
  base64Image = null;
  const box = document.getElementById('preview-box');
  if (box) box.style.display = 'none';
  ['image-input', 'camera-input'].forEach((id) => { const i = document.getElementById(id); if (i) i.value = ''; });
}

async function convertImageTo3D() {
  if (!base64Image) return;
  const mode = (document.getElementById('mode-select') || {}).value || 'relief';
  const wait = appendMessage('جاري تحويل الصورة إلى 3D…', 'ai');
  try {
    await WalowEngine.imageTo3D(base64Image, { mode, width: 4, depth: mode === 'voxel' ? 1 : 0.9 });
    wait.remove();
    appendMessage('تم! الصورة صارت مجسماً داخل اللعبة. اسحب الشاشة لتدور حوله. (النمط: ' + ({ relief: 'تضاريس', standee: 'قصاصة بدون خلفية', voxel: 'مكعبات' }[mode]) + ')', 'ai');
    clearImage();
  } catch (e) {
    wait.remove();
    appendMessage('⚠️ فشل التحويل: ' + (e.message || e), 'ai');
  }
}

// ---------- أدوات الشريط ----------
async function undoLast() {
  if (!engineReady) { appendMessage('⚠️ ' + engineProblem, 'ai'); return; }
  if (!project.snippets.length) { appendMessage('لا يوجد شيء للتراجع عنه.', 'ai'); return; }
  project.snippets.pop(); saveProject(project);
  await rebuild();
  appendMessage('تم التراجع عن آخر تعديل.', 'ai');
}
async function clearAll() {
  if (!engineReady) { appendMessage('⚠️ ' + engineProblem, 'ai'); return; }
  if (!confirm('مسح كل شيء في اللعبة؟')) return;
  project = { snippets: [], started: true }; saveProject(project);
  WalowEngine.reset();
  appendMessage('تم مسح المشهد. اطلب مني بناء ما تريد.', 'ai');
}
function togglePanel() { document.body.classList.toggle('big-game'); }

window.addEventListener('error', (e) => { recentErrors.push(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`); if (recentErrors.length > 10) recentErrors.shift(); });
window.addEventListener('unhandledrejection', (e) => { recentErrors.push(String(e.reason && e.reason.message || e.reason)); if (recentErrors.length > 10) recentErrors.shift(); });

function webglSupported() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; }
}

function showEngineProblem(msg) {
  engineReady = false;
  engineProblem = msg;
  appendMessage('⚠️ ' + msg, 'ai');
  const g = document.getElementById('game-container');
  if (g) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:60px 16px 16px;display:flex;align-items:center;justify-content:center;text-align:center;color:#ffb4b4;font-size:14px;line-height:1.6;direction:rtl';
    d.textContent = msg;
    g.appendChild(d);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const inp = document.getElementById('chat-input');
  if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleUserSubmit(); } });

  if (typeof WalowEngine === 'undefined') {
    showEngineProblem('ملف engine.js لم يُحمَّل. تأكد أنه مرفوع في نفس مجلد index.html وباسم engine.js بالضبط (حجمه نحو 870 كيلوبايت)، ثم أغلق التطبيق وافتحه مرتين.');
    return;
  }
  if (!webglSupported()) {
    showEngineProblem('متصفحك لا يفعّل WebGL (الرسم ثلاثي الأبعاد). جرّب فتح الرابط في كروم مباشرة بدل أي متصفح مدمج، وفعّل تسريع الأجهزة من إعدادات المتصفح.');
    return;
  }
  WalowEngine.onError = (e) => { recentErrors.push(String(e && e.message || e)); appendMessage('⚠️ خطأ أثناء تشغيل اللعبة: ' + (e && e.message || e), 'ai'); };
  try {
    WalowEngine.init(document.getElementById('game-container'));
    engineReady = true;
    // أول تشغيل: المشهد الابتدائي يُحفظ كأول خطوة حتى يعود كما هو عند إعادة فتح التطبيق
    if (!project.started) { project.started = true; project.snippets.unshift(STARTER); saveProject(project); }
    await rebuild();
  } catch (e) {
    showEngineProblem('تعذر تشغيل المحرك: ' + (e && e.message || e));
  }
});
