// 页面并排展示：只负责取数和渲染三锭并排对照，判定结果由 /api/groups 返回。

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --good:#3d6b34; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; font-size:16px; }
    main { padding:22px 28px; display:grid; gap:22px; }
    form,.panel,.card,.stat,.gcard { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; }
    input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:60px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; }
    button.secondary { background:#69736a; } button.small { padding:5px 9px; font-size:12px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    .twocol { display:grid; grid-template-columns:380px 1fr; gap:22px; }
    .gcard { display:grid; gap:12px; margin-bottom:16px; }
    .ghead { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; }
    .chips { display:flex; gap:6px; flex-wrap:wrap; }
    .chip { border:1px solid var(--line); border-radius:6px; padding:3px 8px; font-size:12px; background:#f7f9f4; }
    .chip b { color:var(--accent); }
    .sidebyside { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .stick { border:1px solid var(--line); border-radius:8px; padding:12px; display:grid; gap:6px; align-content:start; background:#fcfdfb; }
    .stick.standout { border-color:var(--good); box-shadow:0 0 0 2px rgba(61,107,52,.15); background:#f4f8f1; }
    .stick.empty { background:#fafafa; color:var(--muted); }
    .scoreline { display:flex; align-items:baseline; gap:8px; } .scoreline strong { font-size:30px; color:var(--accent); }
    .concl { border-radius:8px; padding:12px 14px; font-size:14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .concl.ok { background:#eef5e9; border:1px solid #b9d0a8; color:var(--good); }
    .concl.pending { background:#f5f2e8; border:1px solid #ddd2ac; color:#7a6420; }
    .concl.bad { background:#f8edea; border:1px solid #d8b5ab; color:var(--warn); }
    .concl strong { font-size:18px; }
    .changedtag { font-size:12px; color:#9b4937; border:1px solid #d8b5ab; border-radius:999px; padding:2px 8px; }
    .lockedtag { font-size:12px; color:var(--muted); }
    .recform { display:grid; grid-template-columns:repeat(4,1fr) auto; gap:8px; align-items:end; border-top:1px dashed var(--line); padding-top:10px; }
    .recform label { margin:0 0 4px; }
    .hint { font-size:12px; color:var(--warn); grid-column:1/-1; min-height:0; }
    .history { border-top:1px solid var(--line); padding-top:8px; max-height:110px; overflow:auto; display:grid; gap:3px; font-size:12px; color:var(--muted); }
    .history .void { color:var(--warn); font-weight:700; }
    .modalback { position:fixed; inset:0; background:rgba(30,35,28,.45); display:none; align-items:center; justify-content:center; z-index:50; }
    .modalback.show { display:flex; }
    .modal { background:#fff; border-radius:10px; padding:20px; width:min(560px,92vw); max-height:90vh; overflow:auto; }
    .modal .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .modalfoot { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
    .invalidnote { font-size:12px; color:var(--warn); }
    @media (max-width:980px){ .twocol{grid-template-columns:1fr;} .sidebyside{grid-template-columns:1fr;} .recform{grid-template-columns:1fr 1fr;} }
  </style>
</head>
<body>
  <header>
    <div><h1>墨锭试磨室</h1><div class="meta">单锭试磨记录 · 受控试磨组三锭并排对照</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section class="panel">
      <h2>受控试磨组</h2>
      <div class="meta" style="margin-bottom:12px">建组时锁定纸样、加水量和室温；之后每条结果最多只改一个条件。每锭取最近一条有效结果，评分差≤8分且沉淀等级相同才给组内结论。</div>
      <div id="groups"></div>
    </section>
    <div class="twocol">
      <section>
        <form id="createForm" class="panel"><h2>新增墨锭</h2><div id="fields"></div><label>初始状态</label><select name="status"></select><button>保存墨锭</button></form>
        <form id="actionForm" class="panel" style="margin-top:14px"><h2>单锭试磨记录</h2><label>选择墨锭</label><select name="id" id="itemSelect"></select><div id="extraFields"></div><button>提交记录</button></form>
      </section>
      <section>
        <div class="stats" id="stats"></div>
        <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option></select><input id="search" placeholder="搜索编号或关键词"></div>
        <div class="panel"><h2>墨锭单锭结果</h2><div class="grid" id="cards"></div></div>
      </section>
    </div>
  </main>

  <div class="modalback" id="modalBack">
    <div class="modal">
      <h2 id="modalTitle">条件更正</h2>
      <div class="meta" id="modalIntro" style="margin-bottom:6px"></div>
      <input type="hidden" id="mKind"><input type="hidden" id="mGroupId"><input type="hidden" id="mRecordId">
      <div class="row">
        <div><label>纸样</label><input id="mPaper"></div>
        <div><label>加水量</label><input id="mWater"></div>
      </div>
      <div class="row">
        <div><label>室温</label><input id="mRoomTemp"></div>
        <div class="record-only"><label>沉淀等级</label><select id="mSediment"></select></div>
      </div>
      <div class="row record-only">
        <div><label>评分</label><input id="mScore" type="number" min="0" max="100"></div>
        <div><label>出墨速度</label><input id="mSpeed"></div>
      </div>
      <label class="record-only">墨色层次</label><input class="record-only" id="mColorLayer">
      <label class="record-only">备注</label><textarea class="record-only" id="mNote"></textarea>
      <div class="warn meta" id="mWarn" style="margin-top:8px">更正后本组旧结论立即作废，系统按全部记录重算。</div>
      <div class="modalfoot"><button type="button" class="secondary" id="mCancel">取消</button><button type="button" id="mSave">保存更正</button></div>
    </div>
  </div>

  <script>
    const fields = [["code","墨锭编号","text"],["smokeSource","烟料来源","text"],["glueRatio","胶料比例","text"],["ageYears","存放年限","number"],["storage","存放位置","text"]];
    const stages = ["待试磨","已试磨","重点观察"];
    const extraFields = [["paper","试磨纸张"],["water","加水量"],["speed","出墨速度"],["colorLayer","墨色层次"],["sediment","沉淀情况"],["score","评分"]];
    const conds = [["paper","纸样"],["water","加水量"],["roomTemp","室温"]];
    const sedimentLevels = ["无","少","中","多"];
    let items = [], groups = [];
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function fmtAt(at) { const d = new Date(at); return isNaN(d) ? esc(at) : d.toLocaleString('zh-CN', { hour12:false }); }

    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label>'+(key==='sediment' ? '<select name="'+key+'"><option value=""></option>'+sedimentLevels.map(s=>'<option>'+s+'</option>').join('')+'</select>' : '<input name="'+key+'"'+(key==='score'?' type="number" min="0" max="100"':'')+'>')).join('');
      document.querySelector('#createForm select[name=status]').innerHTML = stages.map(s => '<option>'+s+'</option>').join('');
    }

    function renderSticks() {
      itemSelect.innerHTML = '<option value="">请选择</option>' + items.map(item => '<option value="'+esc(item.id||item.code)+'">'+esc(item.code)+' · '+esc(item.smokeSource)+' '+esc(item.glueRatio)+' 陈'+esc(item.ageYears)+'年</option>').join('');
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(cardHtml).join('') || '<div class="meta">暂无墨锭</div>';
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { await api('/api/items/'+encodeURIComponent(sel.dataset.status), { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { await api('/api/items/'+encodeURIComponent(id)+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } });
    }
    function cardHtml(item) {
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+esc(l.step)+'：'+esc(l.note)+'</div>').join('');
      return '<article class="card"><h3>'+esc(item.code||item.id)+'</h3><span class="pill">'+esc(item.status)+'</span>'+main+
        '<label>状态</label><select data-status="'+esc(item.id||item.code)+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select>'+
        '<button class="secondary" data-note="'+esc(item.id||item.code)+'">追加备注</button><div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }

    function changedTag(ch) {
      if (!ch || !ch.length) return '<span class="lockedtag">按锁定条件</span>';
      const labels = { paper:'改纸样', water:'改加水量', roomTemp:'改室温' };
      return '<span class="changedtag">只改：'+ch.map(k=>labels[k]||k).join('、')+'</span>';
    }
    function conclHtml(g) {
      const c = g.conclusion;
      if (c.kind === 'ok') {
        return '<div class="concl ok">✓ 组内结论成立（'+esc(c.detail)+'）：平均评分 <strong>'+esc(c.averageScore)+'</strong> 分，最突出的一锭为 <strong>'+esc(c.standoutCode)+'</strong><button class="secondary small" data-correct-baseline="'+esc(g.id)+'">更正锁定条件</button></div>';
      }
      if (c.kind === 'pending') {
        return '<div class="concl pending">… '+esc(c.detail)+'<button class="secondary small" data-correct-baseline="'+esc(g.id)+'">更正锁定条件</button></div>';
      }
      return '<div class="concl bad">✗ 不给结论：'+esc(c.detail)+'<button class="secondary small" data-correct-baseline="'+esc(g.id)+'">更正锁定条件</button></div>';
    }
    function stickHtml(g, s) {
      if (!s.latest) {
        return '<div class="stick empty"><h3>'+esc(s.code)+(s.found?'':'（未找到）')+'</h3><div>尚无最近有效结果'+(s.invalidCount?'，已有 '+s.invalidCount+' 条无效记录':'')+'</div></div>';
      }
      const l = s.latest;
      const standout = g.conclusion.kind === 'ok' && g.conclusion.standoutRecordId === l.recordId;
      return '<div class="stick'+(standout?' standout':'')+'">'+
        '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center"><h3>'+esc(s.code)+'</h3>'+(standout?'<span class="pill" style="color:var(--good);border-color:var(--good)">最突出</span>':'')+'</div>'+
        '<div class="meta">'+esc(s.storage||'')+'</div>'+
        '<div class="scoreline"><strong>'+esc(l.score)+'</strong><span>分 · 沉淀'+esc(l.sediment)+'</span></div>'+
        '<div>'+changedTag(l.changed)+'</div>'+
        '<div class="meta">'+fmtAt(l.at)+'</div>'+
        '<div><button class="secondary small" data-correct-record="'+esc(l.recordId)+'" data-group="'+esc(g.id)+'">更正此结果</button></div>'+
        '</div>';
    }
    function recFormHtml(g) {
      const opts = '<option value="">选择墨锭</option>' + g.sticks.map(s => '<option value="'+esc(s.stickId)+'">'+esc(s.code)+'</option>').join('');
      return '<form class="recform" data-group="'+esc(g.id)+'">'+
        '<div><label>锭</label><select name="stickId">'+opts+'</select></div>'+
        '<div><label>纸样（锁定 '+esc(g.paper)+'）</label><input name="paper" placeholder="默认锁定值" data-baseline="'+esc(g.paper)+'"></div>'+
        '<div><label>加水量（锁定 '+esc(g.water)+'）</label><input name="water" placeholder="默认锁定值" data-baseline="'+esc(g.water)+'"></div>'+
        '<div><label>室温（锁定 '+esc(g.roomTemp)+'）</label><input name="roomTemp" placeholder="默认锁定值" data-baseline="'+esc(g.roomTemp)+'"></div>'+
        '<div><label>沉淀</label><select name="sediment"><option value=""></option>'+sedimentLevels.map(x=>'<option>'+x+'</option>').join('')+'</select></div>'+
        '<div><label>评分</label><input name="score" type="number" min="0" max="100"></div>'+
        '<div><label>出墨速度</label><input name="speed"></div>'+
        '<div><label>墨色层次</label><input name="colorLayer"></div>'+
        '<div style="grid-column:1/4"><label>备注</label><input name="note"></div>'+
        '<div><button>录入结果</button></div>'+
        '<div class="hint" data-hint></div></form>';
    }
    function groupHtml(g) {
      const chips = conds.map(([k,label]) => '<span class="chip">'+label+' <b>'+esc(g[k])+'</b></span>').join('');
      const recent = g.records.slice(-6).reverse().map(r => {
        const code = (g.sticks.find(s => s.stickId === r.stickId) || {}).code || r.stickId;
        return '<div class="'+(r.valid?'':'invalidnote')+'">'+fmtAt(r.at)+' '+esc(code)+' 评分'+esc(r.score)+' 沉淀'+esc(r.sediment)+(r.valid ? ' '+changedTag(r.changed) : '（无效：'+(r.missing.length?'缺'+r.missing.map(m=>({paper:'纸样',water:'加水量',roomTemp:'室温',score:'评分',sediment:'沉淀'})[m]).join('/'):'改动超过一项')+'）')+'</div>';
      }).join('');
      const hist = g.history.slice().reverse().map(h => '<div class="'+(h.type==='void'?'void':'')+'">'+fmtAt(h.at)+' '+esc(h.note)+'</div>').join('');
      return '<article class="gcard"><div class="ghead"><div><h3>'+esc(g.name)+'</h3><div class="meta" style="margin-top:4px">'+esc(g.smokeSource)+' · '+esc(g.glueRatio)+' · 陈'+esc(g.ageYears)+'年 · 三锭并排</div></div>'+
        '<div class="chips">'+chips+'</div></div>'+
        conclHtml(g)+
        '<div class="sidebyside">'+g.sticks.map(s=>stickHtml(g,s)).join('')+'</div>'+
        recFormHtml(g)+
        '<div class="meta"><b>近期记录</b>'+(recent?'':'：暂无')+'</div>'+(recent?'<div class="history">'+recent+'</div>':'')+
        '<div class="meta"><b>组内履历（更正与作废留痕）</b></div><div class="history">'+hist+'</div>'+
        '</article>';
    }
    function renderGroups() {
      const host = document.querySelector('#groups');
      if (!groups.length) { host.innerHTML = createFormHtml(); return; }
      host.innerHTML = groups.map(groupHtml).join('') + createFormHtml();
      document.querySelectorAll('.recform').forEach(f => {
        const inputs = conds.map(([k]) => f.querySelector('[name='+k+']'));
        const hint = f.querySelector('[data-hint]');
        const check = () => {
          const diffs = inputs.filter(i => i.value.trim() !== '' && i.value.trim() !== i.dataset.baseline).length;
          hint.textContent = diffs > 1 ? '一次只能改一个条件（当前改了 '+diffs+' 项），请按受控试磨要求录入' : '';
          f.querySelector('button').disabled = diffs > 1;
        };
        inputs.forEach(i => i.addEventListener('input', check));
        f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f); const payload = {}; for (const [k,v] of fd.entries()) payload[k] = v; conds.forEach(([k]) => { if (String(payload[k]||'').trim()==='') payload[k] = f.querySelector('[name='+k+']').dataset.baseline; }); await api('/api/groups/'+encodeURIComponent(f.dataset.group)+'/records', { method:'POST', body: JSON.stringify(payload) }); f.reset(); await load(); };
      });
      document.querySelectorAll('[data-correct-baseline]').forEach(b => b.onclick = () => openModal('baseline', b.dataset.correctBaseline));
      document.querySelectorAll('[data-correct-record]').forEach(b => b.onclick = () => openModal('record', b.dataset.group, b.dataset.correctRecord));
    }
    function createFormHtml() {
      const triple = '<div class="meta" style="grid-column:1/-1;margin:6px 0 0">候选三锭必须同烟料、同胶比、同存放年限</div>';
      return '<form class="panel" id="groupForm" style="border-style:dashed"><h2>建立受控试磨组（三锭）</h2>'+
        '<div class="row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div><label>组名（可选）</label><input name="name"></div><div><label>烟料来源</label><input name="smokeSource" id="gSmoke" list="smokeList"></div><div><label>胶料比例</label><input name="glueRatio"></div></div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div><label>存放年限</label><input name="ageYears" type="number" min="0"></div><div><label>锁定纸样</label><input name="paper" placeholder="如 宣纸"></div><div><label>锁定加水量</label><input name="water" placeholder="如 20滴"></div></div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label>锁定室温</label><input name="roomTemp" placeholder="如 22℃"></div><div style="display:flex;align-items:flex-end"><button>建组</button></div></div>'+
        triple+'<div id="stickPickers" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px"></div></form>'+
        '<datalist id="smokeList"></datalist>';
    }
    function renderCreateForm() {
      const f = document.querySelector('#groupForm');
      if (!f) return;
      document.querySelector('#smokeList').innerHTML = [...new Set(items.map(i=>i.smokeSource).filter(Boolean))].map(s=>'<option value="'+esc(s)+'">').join('');
      document.querySelector('#stickPickers').innerHTML = [1,2,3].map(n => '<label>第'+n+'锭<select name="stickIds"></select></label>').join('');
      const fill = () => {
        const smoke = f.querySelector('#gSmoke').value.trim();
        const glue = f.querySelector('[name=glueRatio]').value.trim();
        const age = f.querySelector('[name=ageYears]').value;
        const pool = items.filter(i => (!smoke || i.smokeSource === smoke) && (!glue || String(i.glueRatio) === glue) && (age === '' || String(i.ageYears) === age));
        f.querySelectorAll('select[name=stickIds]').forEach((sel, idx) => {
          const cur = sel.value;
          sel.innerHTML = '<option value="">请选择</option>' + pool.map(i => '<option value="'+esc(i.code)+'"'+(i.code===cur?' selected':'')+'>'+esc(i.code)+' · '+esc(i.storage||'')+'</option>').join('');
        });
      };
      ['#gSmoke','[name=glueRatio]','[name=ageYears]'].forEach(sel => f.querySelector(sel).addEventListener('input', fill));
      fill();
      f.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(f);
        const payload = { name:fd.get('name'), smokeSource:fd.get('smokeSource'), glueRatio:fd.get('glueRatio'), ageYears:fd.get('ageYears'), paper:fd.get('paper'), water:fd.get('water'), roomTemp:fd.get('roomTemp'), stickIds:fd.getAll('stickIds') };
        await api('/api/groups', { method:'POST', body: JSON.stringify(payload) });
        await load();
      };
    }

    // 条件更正弹窗：改锁定条件或改某条结果，保存后服务端整组重算。
    function openModal(kind, groupId, recordId) {
      const g = groups.find(x => x.id === groupId);
      if (!g) return;
      document.querySelector('#mKind').value = kind;
      document.querySelector('#mGroupId').value = groupId;
      document.querySelector('#mRecordId').value = recordId || '';
      document.querySelector('#mSediment').innerHTML = '<option value=""></option>' + sedimentLevels.map(s=>'<option>'+s+'</option>').join('');
      const title = kind === 'baseline' ? '更正锁定条件' : '更正试磨结果';
      document.querySelector('#modalTitle').textContent = title;
      document.querySelector('#modalIntro').textContent = kind === 'baseline'
        ? ('组：' + g.name + '。原值 纸样=' + g.paper + '，加水量=' + g.water + '，室温=' + g.roomTemp)
        : '只更正这一条结果的录入内容；三条件重新按“最多改一项”判定。';
      let src = { paper:g.paper, water:g.water, roomTemp:g.roomTemp, sediment:'', score:'', speed:'', colorLayer:'', note:'' };
      if (kind === 'record') {
        const r = g.records.find(x => x.id === recordId) || {};
        src = { ...src, ...r };
      }
      for (const k of ['paper','water','roomTemp','sediment','score','speed','colorLayer','note']) {
        const el = document.querySelector('#m'+k.charAt(0).toUpperCase()+k.slice(1));
        if (el) el.value = src[k] == null ? '' : src[k];
      }
      document.querySelectorAll('.record-only').forEach(el => el.style.display = kind === 'record' ? '' : 'none');
      document.querySelector('#modalBack').classList.add('show');
    }
    function closeModal() { document.querySelector('#modalBack').classList.remove('show'); }

    async function saveModal() {
      const kind = document.querySelector('#mKind').value;
      const groupId = document.querySelector('#mGroupId').value;
      const recordId = document.querySelector('#mRecordId').value;
      const payload = {};
      const keys = kind === 'baseline' ? ['paper','water','roomTemp'] : ['paper','water','roomTemp','sediment','score','speed','colorLayer','note'];
      for (const k of keys) {
        const el = document.querySelector('#m'+k.charAt(0).toUpperCase()+k.slice(1));
        if (el) payload[k] = el.value;
      }
      const path = kind === 'baseline' ? '/api/groups/'+encodeURIComponent(groupId) : '/api/groups/'+encodeURIComponent(groupId)+'/records/'+encodeURIComponent(recordId);
      await api(path, { method:'PATCH', body: JSON.stringify(payload) });
      closeModal();
      await load();
    }

    async function load() {
      [items, groups] = await Promise.all([api('/api/items'), api('/api/groups')]);
      document.querySelector('#statusFilter').innerHTML = '<option value="">全部状态</option>'+stages.map(s=>'<option>'+s+'</option>').join('');
      renderSticks();
      renderGroups();
      renderCreateForm();
    }
    createForm.onsubmit = async event => { event.preventDefault(); await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) }); createForm.reset(); await load(); };
    actionForm.onsubmit = async event => { event.preventDefault(); if (!itemSelect.value) return; await api('/api/items/'+encodeURIComponent(itemSelect.value)+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); actionForm.reset(); await load(); };
    document.querySelector('#statusFilter').onchange = renderSticks;
    document.querySelector('#search').oninput = renderSticks;
    document.querySelector('#reload').onclick = load;
    document.querySelector('#mCancel').onclick = closeModal;
    document.querySelector('#mSave').onclick = () => saveModal().catch(e => alert(e.message));
    document.querySelector('#modalBack').onclick = e => { if (e.target.id === 'modalBack') closeModal(); };
    renderForms(); load();
  </script>
</body>
</html>`;
}
