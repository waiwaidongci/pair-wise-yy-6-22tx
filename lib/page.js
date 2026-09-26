// 页面并排展示：单锭卡片照旧，受控试磨组三锭并排、结论横幅和条件更正入口。
// 判定规则见 lib/grouping.js，这里只负责渲染。

const fields = [["code","墨锭编号","text"],["smokeSource","烟料来源","text"],["glueRatio","胶料比例","text"],["ageYears","存放年限","number"],["storage","存放位置","text"]];
const stages = ["待试磨","已试磨","重点观察"];
const extraFields = [["paper","试磨纸张"],["water","加水量"],["roomTemp","室温"],["speed","出墨速度"],["colorLayer","墨色层次"],["sediment","沉淀情况"],["score","评分"]];
const conditionLabels = [["paper","纸样"],["water","加水量"],["roomTemp","室温"]];

export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    #groups { display:grid; gap:12px; }
    .trio { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:8px 0; }
    .col { border:1px solid var(--line); border-radius:6px; padding:10px; display:grid; gap:4px; align-content:start; }
    .col.best { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
    .conclusion { border-radius:6px; padding:8px 10px; font-weight:700; margin:4px 0; }
    .conclusion.ok { background:#e7efe2; color:var(--accent); }
    .conclusion.wait { background:#f4efe3; color:#8a6d2f; }
    .conclusion.bad { background:#f6e7e2; color:var(--warn); }
    form.correct { background:transparent; border:0; border-top:1px solid var(--line); border-radius:0; padding:12px 0 0; display:grid; grid-template-columns:110px 1fr auto; gap:8px; align-items:end; }
    .ghead { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .trio{grid-template-columns:1fr;} form.correct{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header><div><h1>墨锭试磨室</h1><div class="meta">墨锭建档、试磨记录、受控试磨组三锭并排对比</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增墨锭</h2><div id="fields"></div><label>初始状态</label><select name="status">${stages.map(s => '<option>'+s+'</option>').join('')}</select><button>保存墨锭</button></form>
      <form id="actionForm" style="margin-top:14px"><h2>创建试磨记录</h2><label>选择墨锭</label><select name="id" id="itemSelect"></select><div id="extraFields"></div><button>提交记录</button></form>
      <form id="groupForm" style="margin-top:14px"><h2>组建受控试磨组</h2>
        <label>组名（可空）</label><input name="name">
        <label>第一锭</label><select name="m1" class="memberSel"></select>
        <label>第二锭</label><select name="m2" class="memberSel"></select>
        <label>第三锭</label><select name="m3" class="memberSel"></select>
        <label>纸样（建组后锁定）</label><input name="paper" required>
        <label>加水量（建组后锁定）</label><input name="water" required>
        <label>室温（建组后锁定）</label><input name="roomTemp" required>
        <button>建组并锁定条件</button>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stages.map(s => '<option>'+s+'</option>').join('')}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>选择墨锭后录入试磨记录，系统会保留多次试磨结果并更新评分状态。</h2><div class="grid" id="cards"></div></div>
      <div class="panel" style="margin-top:14px"><h2>受控试磨组：同一烟料、胶比和存放年限的三锭并排，只比较符合锁定条件的最近有效结果。</h2><div id="groups"></div></div>
    </section>
  </main>
  <script>
    const fields = ${JSON.stringify(fields)};
    const stages = ${JSON.stringify(stages)};
    const extraFields = ${JSON.stringify(extraFields)};
    const conditionLabels = ${JSON.stringify(conditionLabels)};
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const groupForm = document.querySelector('#groupForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const groupsEl = document.querySelector('#groups');
    const memberSelects = document.querySelectorAll('.memberSel');
    let items = [];
    let groups = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || '请求失败');
      return data;
    }
    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
    }
    function render() {
      itemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.smokeSource || '')+'</option>').join('');
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(item => cardHtml(item)).join('');
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } });
      renderGroups();
    }
    function cardHtml(item) {
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const tasks = (item.tasks || []).map(t => '<div class="meta">任务 '+t.position+' · '+t.status+' · '+t.tension+'</div>').join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
      return '<article class="card"><h3>'+(item.code || item.id)+'</h3><span class="pill">'+item.status+'</span>'+main+tasks+'<label>状态</label><select data-status="'+(item.id || item.code)+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+(item.id || item.code)+'">追加备注</button><div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }
    function fmtAt(at) { return String(at || '').replace('T', ' ').slice(0, 16); }
    function renderGroups() {
      memberSelects.forEach(sel => sel.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.smokeSource || '')+'</option>').join(''));
      groupsEl.innerHTML = groups.length ? groups.map(groupHtml).join('') : '<div class="meta">还没有受控试磨组，可在左侧建组。</div>';
      document.querySelectorAll('form[data-correct]').forEach(form => form.onsubmit = async event => {
        event.preventDefault();
        try {
          await api('/api/groups/'+form.dataset.correct+'/correct', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
          await load();
        } catch (e) { alert(e.message); }
      });
    }
    function groupHtml(g) {
      const key = g.key || {};
      const condText = conditionLabels.map(([f,label]) => label+'：'+(g.conditions[f] || '')).join(' · ');
      const cols = g.members.map(m => {
        const best = g.conclusion.status === 'concluded' && g.conclusion.standout.ref === m.ref;
        const r = m.result;
        return '<div class="col'+(best ? ' best' : '')+'"><div><b>'+m.code+'</b> '+(best ? '<span class="pill">最突出</span>' : '')+'</div>'+
          (r
            ? '<div>评分 <b>'+r.score+'</b> · 沉淀 '+(r.sediment || '—')+'</div><div class="meta">出墨 '+(r.speed || '—')+' · 墨色 '+(r.colorLayer || '—')+'</div><div class="meta">'+fmtAt(r.at)+'</div>'
            : '<div class="warn">无有效结果</div><div class="meta">需符合锁定条件的试磨记录</div>')+'</div>';
      }).join('');
      const c = g.conclusion;
      const banner = c.status === 'concluded'
        ? '<div class="conclusion ok">结论：平均 '+c.average+' 分 · 最突出 '+c.standout.code+'（'+c.standout.score+' 分）· 沉淀 '+c.sediment+'</div>'
        : c.status === 'pending'
          ? '<div class="conclusion wait">待数据：'+c.missing.join('、')+' 缺有效结果</div>'
          : '<div class="conclusion bad">未下结论：'+c.reason+'</div>';
      const hist = (g.history || []).slice(-4).map(h => h.type === 'correct'
        ? '<div>更正 '+h.label+'：'+h.from+' → '+h.to+'（原结论作废：'+h.voided+'）</div>'
        : '<div>建组锁定 '+conditionLabels.map(([f,label]) => label+'：'+((h.conditions || {})[f] || '')).join(' · ')+'</div>').join('');
      return '<article class="card"><div class="ghead"><h3>'+g.name+'</h3><span class="pill">第 '+g.revision+' 版</span></div>'+
        '<div class="meta">'+(key.smokeSource || '')+' · 胶比 '+(key.glueRatio || '')+' · 存放 '+(key.ageYears ?? '')+' 年</div>'+
        '<div class="meta">锁定条件：'+condText+'</div>'+
        '<div class="trio">'+cols+'</div>'+banner+
        '<form data-correct="'+g.id+'" class="correct"><select name="field">'+conditionLabels.map(([f,label]) => '<option value="'+f+'">'+label+'</option>').join('')+'</select><input name="value" placeholder="新值（每次只改一项）" required><button>更正条件</button></form>'+
        '<div class="logs meta">'+hist+'</div></article>';
    }
    async function load() {
      const [its, gps] = await Promise.all([api('/api/items'), api('/api/groups')]);
      items = its;
      groups = gps;
      render();
    }
    createForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) }); createForm.reset(); await load(); } catch (e) { alert(e.message); } };
    actionForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items/'+itemSelect.value+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); actionForm.reset(); await load(); } catch (e) { alert(e.message); } };
    groupForm.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(groupForm).entries());
      try {
        await api('/api/groups', { method:'POST', body: JSON.stringify({ name: data.name, members: [data.m1, data.m2, data.m3], conditions: { paper: data.paper, water: data.water, roomTemp: data.roomTemp } }) });
        groupForm.reset();
        await load();
      } catch (e) { alert(e.message); }
    };
    document.querySelector('#statusFilter').onchange = render; document.querySelector('#search').oninput = render; document.querySelector('#reload').onclick = load;
    renderForms(); load();
  </script>
</body>
</html>`;
}
