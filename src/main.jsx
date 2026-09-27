import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORE_KEY = 'campaigner.archive.v1';
const LEGACY_KEY = 'campaign-log';
const TYPES = ['主线', '支线', '番外'];
const TYPE_COLOR = { 主线: '#d8a153', 支线: '#93b7a6', 番外: '#b9a6d1' };
const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#8fb3c9', '#c98f8f', '#a3c484'];

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const pad2 = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => localDateStr(new Date());
const fmtMD = (d) => (d ? d.slice(5).replace('-', '/') : '--');
const fmtYear = (d) => (d || '').slice(0, 4);
const snapshotOf = (c) => ({ id: c.id, name: c.name, role: c.role, player: c.player, color: c.color });

/* ---------------- 初始示例战役 ---------------- */
function seedCampaign() {
  const characters = [
    { id: 'c-adrian', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', active: true },
    { id: 'c-seline', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', active: true },
    { id: 'c-moore', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', active: true },
  ];
  const all = () => characters.map(snapshotOf);
  const sessions = [
    { id: 's1', date: '2024-06-08', title: '第一章：灰港的钟声', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', color: '#d8a153', order: 1, participants: all() },
    { id: 's2', date: '2024-06-15', title: '第二章：雾中来客', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', color: '#93b7a6', order: 2, participants: all() },
    { id: 's3', date: '2024-06-22', title: '支线：深林采药', summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', color: '#b9a6d1', order: 3, participants: all() },
  ];
  return { id: 'camp-twilight', name: '暮光边境', system: 'D&D 5E', characters, sessions };
}

/* ---------------- 旧版数据迁移（campaign-log） ---------------- */
function migrateCampaign(old) {
  const characters = (old.characters || []).map((c, i) => ({
    id: c.id || `c-${i + 1}`,
    name: c.name || '未命名角色',
    role: c.role || '',
    player: c.player || '',
    color: c.color || PALETTE[i % PALETTE.length],
    active: true,
  }));
  // 旧版没有参战记录，而旧界面一直按“全队参加”展示，故沿用这一记录
  const sessions = (old.sessions || []).map((s, i) => ({
    id: typeof s.id === 'number' ? `s-${s.id}` : String(s.id || uid()),
    date: s.date || today(),
    title: s.title || '未命名章节',
    summary: s.summary || '',
    tag: s.tag || '主线',
    color: s.color || TYPE_COLOR[s.tag] || '#d8a153',
    order: i + 1,
    participants: characters.map(snapshotOf),
  }));
  return { id: uid(), name: old.name || '未命名战役', system: old.system || '', characters, sessions };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.campaigns && s.currentId && s.campaigns[s.currentId]) return s;
    }
  } catch { /* 损坏数据则继续走迁移/种子 */ }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (legacy) {
      const camp = migrateCampaign(legacy);
      return { currentId: camp.id, campaigns: { [camp.id]: camp } };
    }
  } catch { /* 忽略损坏的旧数据 */ }
  const camp = seedCampaign();
  return { currentId: camp.id, campaigns: { [camp.id]: camp } };
}

function App() {
  const [store, setStore] = useState(loadStore);
  const [tab, setTab] = useState('timeline');
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState('');
  const [chapterModal, setChapterModal] = useState(null); // {mode:'create'|'edit', id}
  const [form, setForm] = useState(null);
  const [charModal, setCharModal] = useState(null);     // {mode}
  const [charForm, setCharForm] = useState(null);
  const [retire, setRetire] = useState(null);            // {charId, successorId}
  const [campOpen, setCampOpen] = useState(false);
  const [campForm, setCampForm] = useState({ name: '', system: '' });

  const data = store.campaigns[store.currentId] || Object.values(store.campaigns)[0];

  /* 所有改动即时写入浏览器，按战役归档，刷新/关闭后仍是最后一次记录 */
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 存储已满等情况忽略 */ }
  }, [store]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const charMap = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  const sorted = useMemo(
    () => [...data.sessions].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '')
      || (a.order ?? 0) - (b.order ?? 0)
      || String(a.id).localeCompare(String(b.id))),
    [data.sessions],
  );
  const cur = data.sessions.find((s) => s.id === active) || sorted[0];
  const curIndex = sorted.findIndex((s) => s.id === cur?.id);
  const appearances = useMemo(() => {
    const m = {};
    data.sessions.forEach((s) => s.participants.forEach((p) => { m[p.id] = (m[p.id] || 0) + 1; }));
    return m;
  }, [data.sessions]);
  const sessionsOfChar = (cid) => sorted.filter((s) => s.participants.some((p) => p.id === cid));
  const activeChars = data.characters.filter((c) => c.active);
  const retiredChars = data.characters.filter((c) => !c.active);

  const updateCampaign = (patch) => setStore((s) => ({
    ...s,
    campaigns: { ...s.campaigns, [s.currentId]: { ...s.campaigns[s.currentId], ...patch } },
  }));

  const nextDate = () => {
    const last = sorted[sorted.length - 1];
    if (last?.date) {
      const d = new Date(`${last.date}T00:00:00`);
      d.setDate(d.getDate() + 7);
      return localDateStr(d);
    }
    return today();
  };

  /* ---------------- 章节：新建 / 编辑 / 删除 ---------------- */
  const openChapter = (mode, session) => {
    if (mode === 'create') {
      setForm({ title: '', date: nextDate(), summary: '', tag: '主线', picks: activeChars.map((c) => c.id) });
    } else {
      setForm({
        title: session.title, date: session.date, summary: session.summary, tag: session.tag,
        picks: session.participants.map((p) => p.id),
      });
    }
    setChapterModal({ mode, id: session?.id ?? null });
  };

  const togglePick = (id) => {
    const c = charMap[id];
    if (!c || !c.active) return; // 已停用角色在旧章节中锁定保留，不能勾选/取消
    setForm((f) => ({ ...f, picks: f.picks.includes(id) ? f.picks.filter((x) => x !== id) : [...f.picks, id] }));
  };

  const saveChapter = () => {
    if (!form.title.trim()) { setNotice('请先填写章节标题'); return; }
    const prev = chapterModal.mode === 'edit'
      ? data.sessions.find((s) => s.id === chapterModal.id)
      : null;
    const prevRefs = Object.fromEntries((prev?.participants || []).map((p) => [p.id, p]));
    // 在队角色按当前档案生成快照（改名后各处同步）；已停用角色在旧章节中的原始快照永久保留
    const refs = form.picks.map((id) => {
      const c = charMap[id];
      if (c && !c.active) return prevRefs[id] || snapshotOf(c);
      return c ? snapshotOf(c) : (prevRefs[id] || null);
    }).filter(Boolean);
    const fields = {
      date: form.date,
      title: form.title.trim(),
      summary: form.summary.trim(),
      tag: form.tag,
      participants: refs,
    };
    if (chapterModal.mode === 'edit') {
      updateCampaign({ sessions: data.sessions.map((s) => (s.id === chapterModal.id ? { ...s, ...fields } : s)) });
      setActive(chapterModal.id);
      setNotice('章节已保存，时间线、详情与角色页已同步');
    } else {
      const s = { id: uid(), ...fields, color: TYPE_COLOR[form.tag] || '#d8a153', order: Date.now() };
      updateCampaign({ sessions: [...data.sessions, s] });
      setActive(s.id);
      setNotice('新章节已加入时间线');
    }
    setChapterModal(null);
    setForm(null);
  };

  const removeChapter = () => {
    if (!window.confirm(`确定删除「${cur?.title || form.title}」吗？此操作不可撤销。`)) return;
    const rest = sorted.filter((s) => s.id !== chapterModal.id);
    updateCampaign({ sessions: data.sessions.filter((s) => s.id !== chapterModal.id) });
    setActive(rest[0]?.id ?? null);
    setChapterModal(null);
    setForm(null);
    setNotice('章节已删除');
  };

  /* ---------------- 角色：新建 / 编辑 / 停用 / 重新入队 ---------------- */
  const openChar = (mode, c) => {
    setCharForm(c
      ? { name: c.name, role: c.role, player: c.player, color: c.color }
      : { name: '', role: '', player: '', color: PALETTE[data.characters.length % PALETTE.length] });
    setCharModal({ mode, id: c?.id ?? null });
  };

  const saveChar = () => {
    const v = charForm;
    if (!v.name.trim()) { setNotice('请先填写角色名'); return; }
    if (charModal.mode === 'edit') {
      // 在队角色档案变化同步到所有章节快照；停用后这些快照即冻结为历史记录
      const next = { name: v.name.trim(), role: v.role.trim(), player: v.player.trim(), color: v.color };
      updateCampaign({
        characters: data.characters.map((c) => (c.id === charModal.id ? { ...c, ...next } : c)),
        sessions: data.sessions.map((s) => (s.participants.some((p) => p.id === charModal.id)
          ? { ...s, participants: s.participants.map((p) => (p.id === charModal.id ? { ...p, ...next } : p)) }
          : s)),
      });
      setNotice('角色档案已保存，各章节出场信息已同步；停用后旧章节记录将冻结保留');
    } else {
      updateCampaign({
        characters: [...data.characters, {
          id: uid(), name: v.name.trim(), role: v.role.trim(), player: v.player.trim(), color: v.color, active: true,
        }],
      });
      setNotice('新角色已加入队伍');
    }
    setCharModal(null);
    setCharForm(null);
  };

  const retireTarget = retire ? charMap[retire.charId] : null;
  const retireUsed = retireTarget ? (appearances[retireTarget.id] || 0) : 0;
  const retireCandidates = retireTarget
    ? data.characters.filter((c) => c.active && c.id !== retireTarget.id)
    : [];
  const successor = retire?.successorId ? charMap[retire.successorId] : null;

  const confirmRetire = () => {
    if (retireUsed > 0 && !retire.successorId) return; // 旧章节用过，必须先指定接替者
    updateCampaign({
      characters: data.characters.map((c) => (c.id === retire.charId
        ? { ...c, active: false, successorId: retire.successorId || null, retiredAt: today() }
        : c)),
    });
    setNotice(retire.successorId
      ? `${retireTarget.name} 已停用，旧章节保留原记录，新章节由 ${successor.name} 接替`
      : `${retireTarget.name} 已从队伍停用`);
    setRetire(null);
  };

  const reactivate = (c) => {
    updateCampaign({
      characters: data.characters.map((x) => (x.id === c.id
        ? { ...x, active: true, successorId: null, retiredAt: null }
        : x)),
    });
    setNotice(`${c.name} 已重新入队`);
  };

  /* ---------------- 战役 ---------------- */
  const switchCampaign = (id) => {
    setStore((s) => ({ ...s, currentId: id }));
    setActive(null);
  };
  const createCampaign = () => {
    if (!campForm.name.trim()) { setNotice('请先填写战役名称'); return; }
    const camp = {
      id: uid(), name: campForm.name.trim(), system: campForm.system.trim(),
      characters: [], sessions: [],
    };
    setStore((s) => ({ currentId: camp.id, campaigns: { ...s.campaigns, [camp.id]: camp } }));
    setActive(null);
    setCampOpen(false);
    setCampForm({ name: '', system: '' });
    setNotice('已创建新战役，档案独立保存在浏览器中');
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `${data.name || 'campaign'}.json`;
    a.click();
    setNotice('战役档案已导出');
  };

  const jump = (sid) => { setActive(sid); setTab('timeline'); };
  const navItems = [['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']];
  // 编辑旧章节时，停用角色的锁定卡片直接取该章节冻结的快照（保证显示当时名称/玩家名）
  const editingSession = chapterModal?.mode === 'edit'
    ? data.sessions.find((s) => s.id === chapterModal.id)
    : null;
  const lockedPicks = editingSession && form
    ? editingSession.participants.filter((p) => !charMap[p.id]?.active && form.picks.includes(p.id))
    : [];

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <div className="campaign">
          <small>当前战役（按战役本地存档）</small>
          <select value={data.id} onChange={(e) => switchCampaign(e.target.value)}>
            {Object.values(store.campaigns).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span>{data.system || '未设定规则'} · {fmtYear(sorted[sorted.length - 1]?.date) || '——'}</span>
          <button className="add-camp" onClick={() => setCampOpen(true)}>＋ 新建战役</button>
        </div>
        <nav>
          {navItems.map(([id, ic, t]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <i>{ic}</i>{t}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button>⚙ 偏好设置</button>
          <small>本地存储已开启 · 自动保存</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">MY CAMPAIGN / {data.system}</span>
            <h1>{tab === 'timeline' ? '战役时间线' : tab === 'characters' ? '角色与阵营' : tab === 'places' ? '地点图鉴' : '战利品'}</h1>
          </div>
          <div className="actions">
            <button onClick={exportData} className="outline">↓ 导出</button>
            {tab === 'timeline' && <button onClick={() => openChapter('create')} className="primary">＋ 新建章节</button>}
            {tab === 'characters' && <button onClick={() => openChar('create')} className="primary">＋ 新建角色</button>}
          </div>
        </header>

        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div><span>THE CHRONICLE</span><h2>记录每一次冒险</h2></div>
                <span className="count">{sorted.length} CHAPTERS</span>
              </div>
              {sorted.length === 0 && (
                <div className="empty-log">
                  <p>这部战役还没有章节。</p>
                  <button className="primary" onClick={() => openChapter('create')}>＋ 写下第一章</button>
                </div>
              )}
              {sorted.map((s, i) => (
                <button className={'chapter ' + (cur?.id === s.id ? 'selected' : '')} onClick={() => setActive(s.id)} key={s.id}>
                  <div className="date">
                    <b>{fmtMD(s.date)}</b>
                    <small>{fmtYear(s.date)}</small>
                  </div>
                  <div className="line">
                    <span style={{ background: s.color }}></span>
                    {i < sorted.length - 1 && <i />}
                  </div>
                  <div className="chapter-copy">
                    <div className="tag">{s.tag}</div>
                    <h3>{s.title}</h3>
                    <p>{s.summary}</p>
                    {s.participants.length > 0 && (
                      <div className="mini-people">
                        {s.participants.map((p) => (
                          <span key={p.id} title={`${p.name}（玩家 ${p.player}）`} style={{ background: p.color }}>
                            {p.name[0] || '?'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="arrow">↗</span>
                </button>
              ))}
            </section>

            <section className="detail-panel">
              {cur ? (
                <>
                  <div className="detail-cover" style={{ background: cur.color }}>
                    <span>CHAPTER {String(curIndex + 1).padStart(2, '0')}</span>
                    <i>✦</i>
                  </div>
                  <div className="detail-body">
                    <span className="tag">{cur.tag}</span>
                    <h2>{cur.title}</h2>
                    <p>{cur.summary || '（本章还没有摘要，点击「编辑章节」补充。）'}</p>
                    <div className="meta-grid">
                      <div><small>游戏日期</small><strong>{cur.date}</strong></div>
                      <div><small>参战角色</small><strong>{cur.participants.length} 位</strong></div>
                    </div>
                    <div className="detail-people">
                      <small>本章参战</small>
                      {cur.participants.length === 0 && <p className="hint">尚未记录参战角色。</p>}
                      {cur.participants.map((p) => {
                        const c = charMap[p.id];
                        const retiredHere = c && !c.active;
                        return (
                          <div className="person" key={p.id}>
                            <span className="avatar" style={{ background: p.color }}>{p.name[0] || '?'}</span>
                            <div>
                              <strong>
                                {p.name}
                                {p.role && <em>{p.role}</em>}
                                {retiredHere && <span className="badge off">已停用 · 旧章保留</span>}
                              </strong>
                              <small>玩家 · {p.player || '—'}</small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="detail-actions">
                      <button className="outline" onClick={() => openChapter('edit', cur)}>✎ 编辑章节</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="detail-body"><p className="hint">选择或新建一个章节查看详情。</p></div>
              )}
            </section>
          </div>
        )}

        {tab === 'characters' && (
          <section className="cards">
            <div className="section-note">
              在队 {activeChars.length} 人 · 已停用 {retiredChars.length} 人。停用参加过旧章节的角色前必须指定接替者；
              旧章节永久保留原角色名与玩家名，之后的新章节由接替者出场。
            </div>
            <h4 className="char-group">在队角色</h4>
            {activeChars.length === 0 && <div className="section-note">队伍中还没有角色，点击右上角「新建角色」开始。</div>}
            {activeChars.map((c) => (
              <article className="char-card" key={c.id}>
                <div className="char-head">
                  <div className="avatar" style={{ background: c.color }}>{c.name[0] || '?'}</div>
                  <div className="char-info">
                    <small>{c.role || '未设定职业'}</small>
                    <h3>{c.name}</h3>
                    <p>玩家 · {c.player || '—'}</p>
                  </div>
                  <span className="badge on">在队</span>
                </div>
                <div className="char-appear">
                  <small>出场 {appearances[c.id] || 0} 章</small>
                  <div className="app-chips">
                    {sessionsOfChar(c.id).map((s) => (
                      <button key={s.id} className="chip" onClick={() => jump(s.id)} title={`${s.date} · ${s.tag}`}>{s.title}</button>
                    ))}
                  </div>
                </div>
                <div className="char-actions">
                  <button onClick={() => openChar('edit', c)}>✎ 编辑档案</button>
                  <button onClick={() => setRetire({ charId: c.id, successorId: '' })}>停用角色</button>
                </div>
              </article>
            ))}
            {retiredChars.length > 0 && <h4 className="char-group">已停用（旧章节记录保留）</h4>}
            {retiredChars.map((c) => (
              <article className="char-card retired" key={c.id}>
                <div className="char-head">
                  <div className="avatar" style={{ background: c.color }}>{c.name[0] || '?'}</div>
                  <div className="char-info">
                    <small>{c.role || '未设定职业'}</small>
                    <h3>{c.name}</h3>
                    <p>玩家 · {c.player || '—'}</p>
                  </div>
                  <span className="badge off">已停用</span>
                </div>
                <div className="char-appear">
                  <small>出场 {appearances[c.id] || 0} 章
                    · 接替者：{c.successorId ? charMap[c.successorId]?.name || '（已删除）' : '无'}
                  </small>
                  <div className="app-chips">
                    {sessionsOfChar(c.id).map((s) => (
                      <button key={s.id} className="chip" onClick={() => jump(s.id)} title={`${s.date} · ${s.tag}`}>{s.title}</button>
                    ))}
                  </div>
                </div>
                <div className="char-actions">
                  <button onClick={() => reactivate(c)}>重新入队</button>
                </div>
              </article>
            ))}
          </section>
        )}

        {tab === 'places' && (
          <section className="empty">
            <div>⌖</div>
            <h2>地点图鉴</h2>
            <p>从章节笔记中收集地点。当前已记录灰港、雾林和失落钟楼。</p>
            <div className="place-list">
              <span>01　灰港 <b>已探索</b></span>
              <span>02　失落钟楼 <b>已探索</b></span>
              <span>03　雾林 <b>待探索</b></span>
            </div>
          </section>
        )}
        {tab === 'loot' && (
          <section className="empty">
            <div>◇</div>
            <h2>战利品清单</h2>
            <p>追踪旅途中获得的装备、遗物和金币。</p>
            <div className="place-list">
              <span>月光草 × 3 <b>消耗品</b></span>
              <span>古老铜币 × 1 <b>遗物</b></span>
              <span>灰港守卫徽章 × 2 <b>任务物品</b></span>
            </div>
          </section>
        )}
      </main>

      {/* 章节新建/编辑弹窗 */}
      {chapterModal && form && (
        <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) { setChapterModal(null); setForm(null); } }}>
          <div className="modal modal-lg">
            <button className="close" onClick={() => { setChapterModal(null); setForm(null); }}>×</button>
            <span className="crumb">{chapterModal.mode === 'create' ? 'NEW CHAPTER' : 'EDIT CHAPTER'}</span>
            <h2>{chapterModal.mode === 'create' ? '记录新的章节' : '编辑章节'}</h2>
            <label>章节标题
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：第三章：月下集市" />
            </label>
            <label>游戏日期
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>章节摘要
              <textarea rows="3" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="发生了什么？" />
            </label>
            <label>章节类型
              <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <div className="field">
              <span className="field-label">参战角色（勾选本章出场者）</span>
              <div className="pick-grid">
                {activeChars.map((c) => {
                  const on = form.picks.includes(c.id);
                  return (
                    <button type="button" key={c.id} className={'pick-item' + (on ? ' checked' : '')} onClick={() => togglePick(c.id)}>
                      <span className="tick">{on ? '✓' : ''}</span>
                      <span className="pick-avatar" style={{ background: c.color }}>{c.name[0] || '?'}</span>
                      <span className="pick-who">
                        <strong>{c.name}{c.role && <em>{c.role}</em>}</strong>
                        <small>玩家 · {c.player || '—'}</small>
                      </span>
                    </button>
                  );
                })}
                {lockedPicks.map((c) => (
                  <div className="pick-item locked" key={c.id} title="停用前的旧章节保留原角色，不可取消">
                    <span className="tick">✓</span>
                    <span className="pick-avatar" style={{ background: c.color }}>{c.name[0] || '?'}</span>
                    <span className="pick-who">
                      <strong>{c.name}{c.role && <em>{c.role}</em>}</strong>
                      <small>玩家 · {c.player || '—'}</small>
                    </span>
                    <span className="lock-note">已停用 · 旧章保留</span>
                  </div>
                ))}
                {activeChars.length === 0 && lockedPicks.length === 0 && (
                  <p className="hint">队伍中暂无角色，请先到「角色与阵营」新建。</p>
                )}
              </div>
            </div>
            <div className="modal-actions">
              {chapterModal.mode === 'edit'
                ? <button className="btn-danger" onClick={removeChapter}>删除章节</button>
                : <span />}
              <button className="primary" onClick={saveChapter}>保存章节</button>
            </div>
          </div>
        </div>
      )}

      {/* 角色新建/编辑弹窗 */}
      {charModal && charForm && (
        <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) { setCharModal(null); setCharForm(null); } }}>
          <div className="modal">
            <button className="close" onClick={() => { setCharModal(null); setCharForm(null); }}>×</button>
            <span className="crumb">{charModal.mode === 'create' ? 'NEW CHARACTER' : 'EDIT CHARACTER'}</span>
            <h2>{charModal.mode === 'create' ? '新建角色' : '编辑角色档案'}</h2>
            <label>角色名
              <input value={charForm.name} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} placeholder="例：伊琳" />
            </label>
            <label>职业 / 身份
              <input value={charForm.role} onChange={(e) => setCharForm({ ...charForm, role: e.target.value })} placeholder="例：流浪法师" />
            </label>
            <label>玩家名
              <input value={charForm.player} onChange={(e) => setCharForm({ ...charForm, player: e.target.value })} placeholder="操控这位角色的玩家" />
            </label>
            <div className="field">
              <span className="field-label">标识色</span>
              <div className="swatches">
                {PALETTE.map((col) => (
                  <button
                    type="button" key={col}
                    className={'swatch' + (charForm.color === col ? ' on' : '')}
                    style={{ background: col }}
                    onClick={() => setCharForm({ ...charForm, color: col })}
                  >{charForm.color === col ? '✓' : ''}</button>
                ))}
              </div>
            </div>
            <button className="primary full" onClick={saveChar}>保存角色</button>
          </div>
        </div>
      )}

      {/* 停用角色 / 指定接替者弹窗 */}
      {retire && retireTarget && (
        <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setRetire(null); }}>
          <div className="modal">
            <button className="close" onClick={() => setRetire(null)}>×</button>
            <span className="crumb">RETIRE CHARACTER</span>
            <h2>停用「{retireTarget.name}」</h2>
            {retireUsed > 0 ? (
              <>
                <p className="hint">
                  该角色参加过 {retireUsed} 个章节，停用前必须指定接替者。
                  旧章节仍保留<b>{retireTarget.name}（玩家 {retireTarget.player || '—'}）</b>的原记录；
                  之后新建的章节中，将由接替者代表该位置出场。
                </p>
                <label>接替者
                  <select
                    value={retire.successorId}
                    onChange={(e) => setRetire({ ...retire, successorId: e.target.value })}
                  >
                    <option value="">请选择接替者…</option>
                    {retireCandidates.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}（{c.role || '无职业'} · 玩家 {c.player || '—'}）</option>
                    ))}
                  </select>
                </label>
                {retireCandidates.length === 0 && (
                  <p className="hint warn">队伍里没有其他在队角色。请先取消，去「角色与阵营」新建接替者后再停用。</p>
                )}
                {successor && (
                  <p className="hint">停用后：旧章节 → {retireTarget.name}；新章节 → {successor.name}（玩家 {successor.player || '—'}）。</p>
                )}
                <button
                  className="primary full"
                  disabled={!retire.successorId}
                  onClick={confirmRetire}
                >确认停用并指定接替者</button>
              </>
            ) : (
              <>
                <p className="hint">该角色尚未参加任何章节，可以直接停用，无需指定接替者。</p>
                <button className="primary full" onClick={confirmRetire}>确认停用</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 新建战役弹窗 */}
      {campOpen && (
        <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setCampOpen(false); }}>
          <div className="modal">
            <button className="close" onClick={() => setCampOpen(false)}>×</button>
            <span className="crumb">NEW CAMPAIGN</span>
            <h2>新建战役</h2>
            <p className="hint">每部战役的章节与角色档案独立保存在本浏览器中。</p>
            <label>战役名称
              <input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="例：深渊归途" />
            </label>
            <label>规则系统
              <input value={campForm.system} onChange={(e) => setCampForm({ ...campForm, system: e.target.value })} placeholder="例：D&D 5E /  COC 7E" />
            </label>
            <button className="primary full" onClick={createCampaign}>创建并切换</button>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
