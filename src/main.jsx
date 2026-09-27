import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const KEY = 'campaign-log';
const TAGS = ['主线', '支线', '番外'];
const TAG_COLORS = { 主线: '#d8a153', 支线: '#93b7a6', 番外: '#b9a6d1' };
const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#7fa8c9', '#c98b8b', '#8fb39a'];

const seed = {
  name: '暮光边境',
  system: 'D&D 5E',
  sessions: [
    { id: 1, date: '2024-06-08', title: '第一章：灰港的钟声', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', color: '#d8a153', participants: ['c1', 'c2', 'c3'] },
    { id: 2, date: '2024-06-15', title: '第二章：雾中来客', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', color: '#d8a153', participants: ['c1', 'c2'] },
    { id: 3, date: '2024-06-22', title: '支线：深林采药', summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', color: '#93b7a6', participants: ['c2', 'c3'] },
  ],
  characters: [
    { id: 'c1', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', active: true, successorId: null },
    { id: 'c2', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', active: true, successorId: null },
    { id: 'c3', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', active: true, successorId: null },
  ],
};

// 兼容旧存档：为角色补 id / 状态，为章节补参战名单
const normalize = (d) => ({
  ...d,
  characters: (d.characters || []).map((c, i) => ({ id: 'c' + (i + 1), active: true, successorId: null, ...c })),
  sessions: (d.sessions || []).map((s) => ({ participants: [], ...s })),
});

const read = () => {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)) || seed);
  } catch {
    return normalize(seed);
  }
};

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const blankChapter = () => ({ title: '', date: today(), summary: '', tag: '主线', participants: [] });
const blankChar = () => ({ name: '', role: '', player: '' });

function App() {
  const [data, setData] = useState(read);
  const [tab, setTab] = useState('timeline');
  const [activeId, setActiveId] = useState(null);
  const [notice, setNotice] = useState('');
  const [chapterModal, setChapterModal] = useState(null); // { id: 章节id } 编辑；{ id: null } 新建
  const [form, setForm] = useState(blankChapter);
  const [confirmDel, setConfirmDel] = useState(false);
  const [retireId, setRetireId] = useState(null);
  const [succMode, setSuccMode] = useState('existing');
  const [succId, setSuccId] = useState('');
  const [newSucc, setNewSucc] = useState(blankChar);
  const [viewCharId, setViewCharId] = useState(null);
  const [charFormOpen, setCharFormOpen] = useState(false);
  const [charForm, setCharForm] = useState(blankChar);

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const charById = useMemo(() => Object.fromEntries(data.characters.map((c) => [c.id, c])), [data.characters]);
  const sorted = useMemo(
    () => [...data.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    [data.sessions]
  );
  const cur = sorted.find((s) => s.id === activeId) || sorted[0] || null;
  const activeChars = data.characters.filter((c) => c.active);
  const retiredChars = data.characters.filter((c) => !c.active);
  const appearances = (cid) => sorted.filter((s) => (s.participants || []).includes(cid));
  const partsOf = (s) => (s.participants || []).map((id) => charById[id]).filter(Boolean);
  const curParts = cur ? partsOf(cur) : [];

  // ---- 章节：新建 / 编辑 / 删除 ----
  const openNewChapter = () => {
    setForm(blankChapter());
    setChapterModal({ id: null });
    setConfirmDel(false);
  };
  const openEditChapter = (s) => {
    setForm({ title: s.title, date: s.date, summary: s.summary, tag: s.tag, participants: [...(s.participants || [])] });
    setChapterModal({ id: s.id });
    setConfirmDel(false);
  };
  const togglePart = (cid) =>
    setForm((f) => ({
      ...f,
      participants: f.participants.includes(cid) ? f.participants.filter((x) => x !== cid) : [...f.participants, cid],
    }));
  const saveChapter = () => {
    if (!form.title.trim()) return;
    const color = TAG_COLORS[form.tag] || '#d8a153';
    if (chapterModal.id) {
      setData({
        ...data,
        sessions: data.sessions.map((s) => (s.id === chapterModal.id ? { ...s, ...form, title: form.title.trim(), color } : s)),
      });
      setNotice('章节已更新，时间线与角色出场已同步');
    } else {
      const s = { ...form, title: form.title.trim(), id: Date.now(), color };
      setData({ ...data, sessions: [...data.sessions, s] });
      setActiveId(s.id);
      setNotice('新章节已加入时间线');
    }
    setChapterModal(null);
  };
  const deleteChapter = () => {
    if (!confirmDel) return setConfirmDel(true);
    setData({ ...data, sessions: data.sessions.filter((s) => s.id !== chapterModal.id) });
    setChapterModal(null);
    setNotice('章节已删除，相关出场记录已移除');
  };
  // 编辑旧章节时，已停用角色仍可勾选（用于补录历史）；新章节只列现役角色
  const partOptions = chapterModal?.id ? [...activeChars, ...retiredChars] : activeChars;

  // ---- 角色：加入 / 停用与接替 ----
  const saveChar = () => {
    if (!charForm.name.trim()) return;
    const c = {
      id: 'c' + Date.now(),
      name: charForm.name.trim(),
      role: charForm.role.trim() || '冒险者',
      player: charForm.player.trim() || '—',
      color: PALETTE[data.characters.length % PALETTE.length],
      active: true,
      successorId: null,
    };
    setData({ ...data, characters: [...data.characters, c] });
    setCharForm(blankChar());
    setCharFormOpen(false);
    setNotice(`${c.name} 已加入队伍`);
  };

  const retireChar = retireId ? charById[retireId] : null;
  const retireApps = retireId ? appearances(retireId) : [];
  const needSuccessor = retireApps.length > 0;
  const retireOthers = activeChars.filter((c) => c.id !== retireId);
  const canRetire =
    !needSuccessor || (succMode === 'existing' && !!succId) || (succMode === 'new' && !!newSucc.name.trim());
  const openRetire = (cid) => {
    const others = activeChars.filter((c) => c.id !== cid);
    setRetireId(cid);
    setSuccMode(appearances(cid).length ? (others.length ? 'existing' : 'new') : 'none');
    setSuccId(others[0]?.id || '');
    setNewSucc(blankChar());
  };
  const confirmRetire = () => {
    if (!canRetire || !retireChar) return;
    let sid = null;
    let succName = null;
    const characters = data.characters.map((c) => ({ ...c }));
    if (succMode === 'new' && newSucc.name.trim()) {
      sid = 'c' + Date.now();
      succName = newSucc.name.trim();
      characters.push({
        id: sid,
        name: succName,
        role: newSucc.role.trim() || retireChar.role,
        player: newSucc.player.trim() || '—',
        color: PALETTE[characters.length % PALETTE.length],
        active: true,
        successorId: null,
      });
    } else if (succMode === 'existing' && succId) {
      sid = succId;
      succName = charById[sid]?.name;
    }
    setData({
      ...data,
      characters: characters.map((c) => (c.id === retireId ? { ...c, active: false, successorId: sid } : c)),
    });
    setRetireId(null);
    setNotice(
      succName
        ? `${retireChar.name} 已停用，由 ${succName} 接替；历史章节保留原记录`
        : `${retireChar.name} 已停用`
    );
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'campaign.json';
    a.click();
    setNotice('战役记录已导出');
  };

  const viewChar = viewCharId ? charById[viewCharId] : null;
  const viewApps = viewChar ? appearances(viewChar.id) : [];
  const viewSucc = viewChar?.successorId ? charById[viewChar.successorId] : null;

  const renderCharCard = (c) => {
    const apps = appearances(c.id);
    const succ = c.successorId ? charById[c.successorId] : null;
    return (
      <article className={'char-card' + (c.active ? '' : ' retired')} key={c.id}>
        <div className="avatar" style={{ background: c.color }}>{c.name[0]}</div>
        <div>
          <small>{c.role}{c.active ? '' : ' · 已停用'}</small>
          <h3>{c.name}</h3>
          <p>玩家 · {c.player}</p>
          <p className="stat">出场 {apps.length} 章{succ ? ` · 由 ${succ.name} 接替` : ''}</p>
        </div>
        <div className="card-actions">
          <button onClick={() => setViewCharId(c.id)}>档案</button>
          {c.active && (
            <button className="warn" onClick={() => openRetire(c.id)}>停用</button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <div className="campaign">
          <small>当前战役</small>
          <strong>{data.name}</strong>
          <span>{data.system} · 2024</span>
        </div>
        <nav>
          {[['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']].map(([id, i, t]) => (
            <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><i>{i}</i>{t}</button>
          ))}
        </nav>
        <div className="side-bottom">
          <button>⚙ 偏好设置</button>
          <small>本地存储已开启</small>
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
            <button onClick={openNewChapter} className="primary">＋ 新建章节</button>
          </div>
        </header>

        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div><span>THE CHRONICLE</span><h2>记录每一次冒险</h2></div>
                <span className="count">{sorted.length} CHAPTERS</span>
              </div>
              {sorted.length === 0 && <p className="empty-hint">还没有章节，点击右上角「新建章节」写下第一页。</p>}
              {sorted.map((s, i) => {
                const parts = partsOf(s);
                return (
                  <button className={'chapter ' + (cur && cur.id === s.id ? 'selected' : '')} onClick={() => setActiveId(s.id)} key={s.id}>
                    <div className="date">
                      <b>{new Date(s.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</b>
                      <small>{new Date(s.date).getFullYear()}</small>
                    </div>
                    <div className="line"><span style={{ background: s.color }}></span>{i < sorted.length - 1 && <i />}</div>
                    <div className="chapter-copy">
                      <div className="tag">{s.tag}</div>
                      <h3>{s.title}</h3>
                      <p>{s.summary}</p>
                      {parts.length > 0 && (
                        <div className="party">
                          {parts.map((c) => (
                            <i key={c.id} style={{ background: c.color }} title={`${c.name} · 玩家 ${c.player}`}>{c.name[0]}</i>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="arrow">↗</span>
                  </button>
                );
              })}
            </section>
            <section className="detail-panel">
              {cur ? (
                <>
                  <div className="detail-cover" style={{ background: cur.color }}>
                    <span>CHAPTER {String(sorted.findIndex((x) => x.id === cur.id) + 1).padStart(2, '0')}</span><i>✦</i>
                  </div>
                  <div className="detail-body">
                    <span className="tag">{cur.tag}</span>
                    <h2>{cur.title}</h2>
                    <p>{cur.summary}</p>
                    <div className="meta-grid">
                      <div><small>游戏日期</small><strong>{cur.date}</strong></div>
                      <div><small>参战角色</small><strong>{curParts.length} 位</strong></div>
                    </div>
                    <div className="participants">
                      {curParts.map((c) => (
                        <span className="chip" key={c.id}>
                          <i style={{ background: c.color }}>{c.name[0]}</i>
                          {c.name}
                          <small>玩家 · {c.player}{c.active ? '' : ' · 已停用'}</small>
                        </span>
                      ))}
                      {curParts.length === 0 && <span className="empty-hint">尚未勾选参战角色，点击「编辑」补充。</span>}
                    </div>
                    <div className="note">
                      <span>✎</span>
                      <div>
                        <strong>档案维护</strong>
                        <p>标题、日期、摘要、类型与参战角色都可以随时修正。</p>
                      </div>
                      <button onClick={() => openEditChapter(cur)}>编辑</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="detail-body"><p className="empty-hint">选择或新建一个章节查看详情。</p></div>
              )}
            </section>
          </div>
        )}

        {tab === 'characters' && (
          <section className="cards">
            <div className="section-head">
              <div className="section-note">队伍中有 {activeChars.length} 位现役冒险者，点击「档案」查看出场记录。</div>
              <button className="mini-btn" onClick={() => setCharFormOpen(true)}>＋ 新角色</button>
            </div>
            {activeChars.map(renderCharCard)}
            {activeChars.length === 0 && <p className="empty-hint">队伍暂时为空，点击「新角色」招募第一位冒险者。</p>}
            {retiredChars.length > 0 && <div className="subhead">已停用档案（历史章节仍保留原名记录）</div>}
            {retiredChars.map(renderCharCard)}
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

      {chapterModal && (
        <div className="modal-bg" onClick={() => setChapterModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setChapterModal(null)}>×</button>
            <span className="crumb">{chapterModal.id ? 'EDIT CHAPTER' : 'NEW CHAPTER'}</span>
            <h2>{chapterModal.id ? '编辑章节' : '记录新的章节'}</h2>
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
                {TAGS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <div className="check-block">
              <span>参战角色（已选 {form.participants.length} 位）</span>
              <div className="check-list">
                {partOptions.map((c) => (
                  <label className={'check-row' + (c.active ? '' : ' off')} key={c.id}>
                    <input type="checkbox" checked={form.participants.includes(c.id)} onChange={() => togglePart(c.id)} />
                    <i style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <small>玩家 · {c.player}{c.active ? '' : ' · 已停用'}</small>
                  </label>
                ))}
                {partOptions.length === 0 && <p className="empty-hint">队伍中还没有角色，可先在「角色与阵营」添加。</p>}
              </div>
            </div>
            <button className="primary full" disabled={!form.title.trim()} onClick={saveChapter}>
              {chapterModal.id ? '保存修改' : '保存章节'}
            </button>
            {chapterModal.id && (
              <button className="danger-link" onClick={deleteChapter}>
                {confirmDel ? '再次点击确认删除（出场记录将一并移除）' : '删除本章节'}
              </button>
            )}
          </div>
        </div>
      )}

      {retireChar && (
        <div className="modal-bg" onClick={() => setRetireId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setRetireId(null)}>×</button>
            <span className="crumb">RETIRE CHARACTER</span>
            <h2>停用 {retireChar.name}</h2>
            <p className="modal-note">
              {needSuccessor
                ? `${retireChar.name} 在 ${retireApps.length} 个章节中出场，停用前需要指定接替者。历史章节仍保留「${retireChar.name}（玩家 · ${retireChar.player}）」的记录，之后的新章节将由接替者出战。`
                : `${retireChar.name} 没有出场记录，可以直接停用；也可以指定接替者，之后的新章节由接替者出战。`}
            </p>
            <label>接替方式
              <select value={succMode} onChange={(e) => setSuccMode(e.target.value)}>
                {!needSuccessor && <option value="none">不指定接替者</option>}
                {retireOthers.length > 0 && <option value="existing">选择现有角色</option>}
                <option value="new">新建接替角色</option>
              </select>
            </label>
            {succMode === 'existing' && retireOthers.length > 0 && (
              <label>接替者
                <select value={succId} onChange={(e) => setSuccId(e.target.value)}>
                  {retireOthers.map((c) => (
                    <option value={c.id} key={c.id}>{c.name}（{c.role} · 玩家 {c.player}）</option>
                  ))}
                </select>
              </label>
            )}
            {succMode === 'new' && (
              <>
                <label>新角色名
                  <input value={newSucc.name} onChange={(e) => setNewSucc({ ...newSucc, name: e.target.value })} placeholder={`接替 ${retireChar.name} 的角色`} />
                </label>
                <label>职业
                  <input value={newSucc.role} onChange={(e) => setNewSucc({ ...newSucc, role: e.target.value })} placeholder={retireChar.role} />
                </label>
                <label>玩家
                  <input value={newSucc.player} onChange={(e) => setNewSucc({ ...newSucc, player: e.target.value })} placeholder="玩家姓名" />
                </label>
              </>
            )}
            <button className="primary full" disabled={!canRetire} onClick={confirmRetire}>确认停用</button>
          </div>
        </div>
      )}

      {viewChar && (
        <div className="modal-bg" onClick={() => setViewCharId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setViewCharId(null)}>×</button>
            <span className="crumb">CHARACTER FILE</span>
            <div className="char-head">
              <div className="avatar" style={{ background: viewChar.color }}>{viewChar.name[0]}</div>
              <div>
                <h2>{viewChar.name}</h2>
                <p>{viewChar.role} · 玩家 {viewChar.player}</p>
              </div>
            </div>
            <div className="status-line">
              {viewChar.active
                ? `现役队员 · 共出场 ${viewApps.length} 章`
                : `已停用${viewSucc ? `，由 ${viewSucc.name}（玩家 · ${viewSucc.player}）接替` : ''} · 历史出场 ${viewApps.length} 章`}
            </div>
            <div className="appear-list">
              {viewApps.length === 0 && <p className="empty-hint">还没有出场记录，在章节编辑中勾选即可。</p>}
              {viewApps.map((s) => (
                <button key={s.id} onClick={() => { setActiveId(s.id); setTab('timeline'); setViewCharId(null); }}>
                  <small>{s.date}</small>
                  <span className="t">{s.title}</span>
                  <span className="tag">{s.tag}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {charFormOpen && (
        <div className="modal-bg" onClick={() => setCharFormOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setCharFormOpen(false)}>×</button>
            <span className="crumb">NEW CHARACTER</span>
            <h2>新角色加入队伍</h2>
            <label>角色名
              <input value={charForm.name} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} placeholder="例：薇拉" />
            </label>
            <label>职业
              <input value={charForm.role} onChange={(e) => setCharForm({ ...charForm, role: e.target.value })} placeholder="例：术士" />
            </label>
            <label>玩家
              <input value={charForm.player} onChange={(e) => setCharForm({ ...charForm, player: e.target.value })} placeholder="玩家姓名" />
            </label>
            <button className="primary full" disabled={!charForm.name.trim()} onClick={saveChar}>加入队伍</button>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
