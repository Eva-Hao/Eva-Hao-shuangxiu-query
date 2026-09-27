/* ===========================================================
   页面交互
   =========================================================== */
(function () {
  const R = window.Rules;
  const S = window.Store;
  const CFG = window.APP_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), ms || 2200);
  }

  const busy = (el, on, text) => {
    if (!el) return;
    if (on) { el.dataset.txt = el.textContent; el.textContent = text || '处理中…'; el.disabled = true; }
    else { el.textContent = el.dataset.txt || el.textContent; el.disabled = false; }
  };

  /* ---------------- 选项卡 ---------------- */
  function showTab(key) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.tab === key));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('is-on', p.id === 'panel-' + key));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) showTab(t.dataset.tab);
  });

  /* ---------------- 通用渲染片段 ---------------- */
  function distBar(c) {
    const total = c.c1 + c.c2 + c.c3;
    if (!total) return '';
    const pct = n => (n / total * 100).toFixed(2) + '%';
    return `
      <div class="dist">
        <div class="dist-top"><span>标记分布（共 ${total} 人认领）</span><span>严格 ${c.c1} · 非严格 ${c.c2} · 非双休 ${c.c3}</span></div>
        <div class="dist-bar">
          <i class="d1" style="width:${pct(c.c1)}"></i>
          <i class="d2" style="width:${pct(c.c2)}"></i>
          <i class="d3" style="width:${pct(c.c3)}"></i>
        </div>
        <div class="dist-key">
          <s><u class="k1"></u>严格双休 ${c.c1}</s>
          <s><u class="k2"></u>非严格双休 ${c.c2}</s>
          <s><u class="k3"></u>非双休 ${c.c3}</s>
        </div>
      </div>`;
  }

  function productList(products) {
    if (!products || !products.length) {
      return `<div class="plist"><div class="plist-title">该企业的产品编码</div>
        <div class="hint" style="margin:0">暂无收录产品，可在「产品录入」中添加</div></div>`;
    }
    return `<div class="plist">
      <div class="plist-title">该企业的产品编码（共 ${products.length} 条）</div>
      ${products.map(p => `<div class="plist-row"><code>${esc(p.barcode)}</code><span>${esc(p.brand)}</span></div>`).join('')}
    </div>`;
  }

  function enterpriseCard(ent, opt) {
    opt = opt || {};
    const s = ent.status;
    const mine = ent.myOption
      ? `<span class="badge badge-mine">我已标记：${R.STATUS_TEXT[ent.myOption]}</span>` : '';
    return `
    <div class="res-card">
      <div class="res-bar st-${s}"></div>
      <div class="res-head">
        <div class="res-name">${esc(ent.name)}</div>
        <div class="res-row">
          <span class="badge b-${s}">${esc(R.STATUS_TEXT[s])}</span>
          <span class="plist-title" style="margin:0">${ent.marksCount} 人认领</span>
          ${mine}
        </div>
      </div>
      <div class="note n-${s}">${esc(ent.note)}</div>
      ${distBar(ent.counts)}
      ${opt.noProducts ? '' : productList(ent.products)}
      ${opt.actions || ''}
    </div>`;
  }

  function chainHtml(product, ent) {
    const s = ent ? ent.status : 0;
    return `
    <div class="chain">
      <div class="chain-title">字段关系：条码 → 品牌 → 企业 → 双休状态</div>
      <div class="chain-row">
        <span class="node n-code">${esc(product.barcode)}</span>
        <span class="arrow">→</span>
        <span class="node n-brand">${esc(product.brand)}</span>
        <span class="arrow">→</span>
        <span class="node">${esc(ent ? ent.name : '未知企业')}</span>
        <span class="arrow">→</span>
        <span class="node n-st${s}">${esc(R.STATUS_TEXT[s])}</span>
      </div>
    </div>`;
  }

  /* =========================================================
     企业查询（双模式：名称模糊搜索 / 标签清单）
     ========================================================= */
  let entQMode = 'name';
  let entTag = 'all';

  document.querySelectorAll('[data-qmode]').forEach(btn => {
    btn.addEventListener('click', () => {
      entQMode = btn.dataset.qmode;
      document.querySelectorAll('[data-qmode]').forEach(b => b.classList.toggle('is-on', b === btn));
      $('qName').hidden = entQMode !== 'name';
      $('qTag').hidden = entQMode !== 'tag';
      if (entQMode === 'tag') loadTagList();
      else $('entResult').innerHTML = '';
    });
  });

  function renderChips(counts) {
    const c = counts || { s0: 0, s1: 0, s2: 0, s3: 0 };
    const items = [
      ['all', '全部', c.s0 + c.s1 + c.s2 + c.s3],
      ['1', '双休', c.s1],
      ['2', '非严格双休', c.s2],
      ['3', '非双休', c.s3],
      ['0', '未录入', c.s0]
    ];
    $('tagChips').innerHTML = items.map(([v, t, n]) =>
      `<button class="chip c-${v} ${entTag === v ? 'is-on' : ''}" data-tag="${v}">${t}<i>${n}</i></button>`).join('');
  }

  function listRow(v) {
    return `
    <button class="ent-row" data-entname="${esc(v.name)}">
      <span class="er-main">
        <span class="er-name">${esc(v.name)}</span>
        <span class="er-meta">${v.marksCount} 人认领 · ${v.products.length} 个产品</span>
      </span>
      <span class="badge b-${v.status}">${esc(R.STATUS_TEXT[v.status])}</span>
    </button>`;
  }

  async function loadTagList() {
    const box = $('entResult');
    box.innerHTML = `<div class="skeleton">加载中…</div>`;
    try {
      const res = await S.listEnterprises({ status: entTag });
      renderChips(res.counts);
      if (!res.list.length) {
        box.innerHTML = `<div class="empty"><span class="empty-ico">◇</span>
          <b>这个标签下暂时没有企业</b><p>去「企业录入」认领第一家</p></div>`;
        return;
      }
      box.innerHTML =
        `<div class="card" style="padding:12px 16px"><div class="sec-sub" style="margin:0">共 ${res.total} 家企业${res.list.length < res.total ? '，当前显示前 ' + res.list.length + ' 家' : ''}</div></div>`
        + res.list.map(listRow).join('');
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body"><b>加载失败</b>${esc(err.message || err)}</div></div>`;
    }
  }

  $('tagChips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    entTag = c.dataset.tag;
    loadTagList();
  });

  async function doFindEnt() {
    const kw = $('entName').value.trim();
    const box = $('entResult');
    if (!kw) return toast('请输入企业名称关键词');
    box.innerHTML = `<div class="skeleton">搜索中…</div>`;
    try {
      const res = await S.listEnterprises({ keyword: kw });
      if (!res.total) {
        box.innerHTML = `
          <div class="res-card">
            <div class="res-bar st-0"></div>
            <div class="res-head">
              <div class="res-name">${esc(kw)}</div>
              <div class="res-row"><span class="badge b-0">未录入企业</span></div>
            </div>
            <div class="note n-0">数据库里还没有名称含「${esc(kw)}」的企业。如果你在这家公司工作，可以去「企业录入」认领并标记它的作息情况。</div>
            <div class="plist">
              <button class="btn btn-plain btn-sm" data-goto="entIn" data-name="${esc(kw)}">去认领这家企业</button>
            </div>
          </div>`;
        return;
      }
      /* 唯一命中（或名称完全相等）→ 直接展示详情 */
      const exact = res.list.find(v => v.name === kw);
      if (res.total === 1 || exact) {
        const ent = exact || res.list[0];
        $('entResult').innerHTML = renderEntCard(ent);
        return;
      }
      $('entResult').innerHTML =
        `<div class="card" style="padding:12px 16px"><div class="sec-sub" style="margin:0">名称含「${esc(kw)}」的企业共 ${res.total} 家，点任意一家查看详情</div></div>`
        + res.list.map(listRow).join('');
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body"><b>查询失败</b>${esc(err.message || err)}</div></div>`;
    }
  }

  /* 清单行点击 → 精确查询并展开详情 */
  document.addEventListener('click', async e => {
    const row = e.target.closest('.ent-row');
    if (!row) return;
    const name = row.dataset.entname;
    $('entResult').innerHTML = `<div class="skeleton">加载中…</div>`;
    try {
      const res = await S.findEnterprise(name);
      $('entResult').innerHTML = res.found
        ? renderEntCard(res.enterprise)
        : `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body">该企业已被删除</div></div>`;
    } catch (err) {
      $('entResult').innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body">${esc(err.message || err)}</div></div>`;
    }
  });

  function renderEntCard(ent) {
    const actions = `
      <div class="plist">
        <button class="btn btn-plain btn-sm" data-share="${esc(ent.name)}">复制链接分享给同事</button>
      </div>`;
    return enterpriseCard(ent, { actions });
  }

  $('btnFindEnt').addEventListener('click', doFindEnt);
  $('entName').addEventListener('keydown', e => { if (e.key === 'Enter') doFindEnt(); });

  /* =========================================================
     产品查询
     ========================================================= */
  let prodMode = 'scan';
  document.querySelectorAll('.sw').forEach(btn => {
    btn.addEventListener('click', () => {
      prodMode = btn.dataset.mode;
      document.querySelectorAll('.sw').forEach(b => b.classList.toggle('is-on', b === btn));
      $('prodScan').hidden = prodMode !== 'scan';
      $('prodBrand').hidden = prodMode !== 'brand';
      $('prodResult').innerHTML = '';
    });
  });

  async function doFindCode() {
    const code = $('barcode').value.trim();
    const box = $('prodResult');
    if (!code) return toast('请扫描或输入产品条形码');
    box.innerHTML = `<div class="skeleton">查询中…</div>`;
    try {
      const res = await S.queryProductByBarcode(code);
      if (!res.found) {
        box.innerHTML = `
          <div class="alert alert-warn"><span class="a-ico">?</span><div class="a-body">
            <b>未查到对应品牌</b>
            <div class="a-line">条码 ${esc(code)} 尚未被收录。你可以在「产品录入」里补充它的品牌与所属企业。</div>
          </div></div>
          <button class="btn btn-plain" data-goto="prodIn" data-code="${esc(code)}">去录入这个条码</button>`;
        return;
      }
      box.innerHTML = chainHtml(res.product, res.enterprise) + enterpriseCard(res.enterprise);
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body"><b>查询失败</b>${esc(err.message || err)}</div></div>`;
    }
  }

  async function doFindBrand() {
    const kw = $('brand').value.trim();
    const box = $('prodResult');
    if (!kw) return toast('请输入品牌名称');
    box.innerHTML = `<div class="skeleton">查询中…</div>`;
    try {
      const res = await S.queryProductByBrand(kw);
      if (!res.found) {
        box.innerHTML = `
          <div class="res-card">
            <div class="res-bar st-0"></div>
            <div class="res-head"><div class="res-name">${esc(kw)}</div>
              <div class="res-row"><span class="badge b-0">未查到对应品牌</span></div></div>
            <div class="note n-0">没有匹配到任何产品。可在「产品录入」中录入该品牌的产品条码与所属企业。</div>
          </div>`;
        return;
      }
      box.innerHTML = `<div class="card" style="padding:12px 16px"><div class="sec-sub" style="margin:0">品牌「${esc(res.brand)}」共匹配到 ${res.list.length} 条产品</div></div>`
        + res.list.map(it => chainHtml({ barcode: it.barcode, brand: it.brand }, it.enterprise)
          + enterpriseCard(it.enterprise || R.unknownEnterprise('未知企业'))).join('');
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body"><b>查询失败</b>${esc(err.message || err)}</div></div>`;
    }
  }

  $('btnFindCode').addEventListener('click', doFindCode);
  $('barcode').addEventListener('keydown', e => { if (e.key === 'Enter') doFindCode(); });
  $('btnFindBrand').addEventListener('click', doFindBrand);
  $('brand').addEventListener('keydown', e => { if (e.key === 'Enter') doFindBrand(); });

  /* =========================================================
     摄像头扫码（浏览器支持 BarcodeDetector 时可用）
     ========================================================= */
  let scanner = null;

  async function startScan(boxEl, onCode, liveTipEl) {
    if (scanner) stopScan();
    if (!('BarcodeDetector' in window)) {
      throw new Error('当前浏览器不支持直接扫码（Safari / 微信内置浏览器多数不支持），请手动输入条形码');
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前环境无法调用摄像头，请手动输入条形码');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    boxEl.classList.add('is-live');
    boxEl.innerHTML = '';
    boxEl.appendChild(video);
    if (liveTipEl) {
      const tip = document.createElement('div');
      tip.className = 'scan-live-tip';
      tip.textContent = '对准条形码…（点这里取消）';
      tip.addEventListener('click', stopScan);
      boxEl.appendChild(tip);
    }
    await video.play();

    let det = null;
    try { det = new window.BarcodeDetector(); } catch (e) { det = new window.BarcodeDetector({ formats: [] }); }
    let stopped = false;

    scanner = {
      stop() {
        stopped = true;
        stream.getTracks().forEach(t => t.stop());
        boxEl.classList.remove('is-live');
        scanner = null;
      }
    };

    (async function tick() {
      if (stopped) return;
      try {
        const codes = await det.detect(video);
        if (codes && codes.length) {
          const val = codes[0].rawValue;
          stopScan();
          onCode(val);
          return;
        }
      } catch (e) { /* 忽略单帧识别错误 */ }
      requestAnimationFrame(tick);
    })();
  }

  function stopScan() {
    if (scanner && scanner.stop) scanner.stop();
    scanner = null;
    resetScanBox();
  }

  function resetScanBox() {
    const box = $('btnScan');
    box.classList.remove('is-live');
    box.innerHTML = `<span class="scan-ico">|||||</span>
      <b>点击扫描产品条形码</b>
      <em>需浏览器支持摄像头扫码；不支持时可手动输入</em>`;
  }

  $('btnScan').addEventListener('click', async () => {
    if (scanner) return stopScan();
    try {
      await startScan($('btnScan'), val => {
        $('barcode').value = val;
        toast('识别到条码 ' + val);
        doFindCode();
      }, $('scanHint'));
    } catch (err) {
      resetScanBox();
      toast(err.message || '无法启动摄像头', 3000);
    }
  });

  $('btnInScan').addEventListener('click', async () => {
    const btn = $('btnInScan');
    try {
      await startScan($('btnInScan'), val => {
        $('inBarcode').value = val;
        toast('识别到条码 ' + val);
      });
    } catch (err) {
      btn.textContent = '扫描条形码';
      toast(err.message || '无法启动摄像头', 3000);
    }
  });

  /* =========================================================
     企业录入
     ========================================================= */
  let entOption = 0;
  let pickedEnt = null;   // 产品录入里选中的企业

  document.querySelectorAll('#optList .opt').forEach(btn => {
    btn.addEventListener('click', () => {
      entOption = Number(btn.dataset.opt);
      document.querySelectorAll('#optList .opt').forEach(b => b.classList.toggle('is-on', b === btn));
      syncMarkBtn();
    });
  });

  function syncMarkBtn() {
    $('btnSubmitMark').disabled = !($('inEntName').value.trim() && entOption);
  }
  $('inEntName').addEventListener('input', () => { syncMarkBtn(); $('dupBox').innerHTML = ''; });

  $('btnDup').addEventListener('click', async () => {
    const name = $('inEntName').value.trim();
    const box = $('dupBox');
    if (!name) return toast('请先输入企业全称');
    box.innerHTML = `<div class="skeleton">查询中…</div>`;
    try {
      const res = await S.findEnterprise(name);
      if (!res.found) {
        box.innerHTML = `<div class="alert alert-ok" style="margin-top:12px"><span class="a-ico">新</span>
          <div class="a-body"><b>该企业尚未收录</b>提交后将自动新建这家企业。</div></div>`;
      } else {
        const e = res.enterprise;
        box.innerHTML = `<div class="alert alert-warn" style="margin-top:12px"><span class="a-ico">已</span>
          <div class="a-body"><b>该企业已被收录</b>
            当前状态：${esc(R.STATUS_TEXT[e.status])}，已有 ${e.marksCount} 人认领${e.myOption ? '，你已标记为「' + R.STATUS_TEXT[e.myOption] + '」' : ''}。
            提交后会更新/新增你自己的标记，不会影响其他人的标记。</div></div>`;
      }
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err" style="margin-top:12px"><span class="a-ico">!</span>
        <div class="a-body">${esc(err.message || err)}</div></div>`;
    }
  });

  $('btnSubmitMark').addEventListener('click', async () => {
    const name = $('inEntName').value.trim();
    const btn = $('btnSubmitMark');
    if (!name) return toast('请输入企业全称');
    if (!entOption) return toast('请选择双休情况');
    busy(btn, true, '提交中…');
    try {
      const res = await S.setMark({ name, option: entOption });
      toast('已提交：' + name + ' → ' + R.STATUS_TEXT[res.enterprise.status]);
      $('inEntName').value = '';
      $('dupBox').innerHTML = '';
      entOption = 0;
      document.querySelectorAll('#optList .opt').forEach(b => b.classList.remove('is-on'));
      syncMarkBtn();
      // 提交后直接把结果展示出来
      showTab('ent');
      $('entName').value = res.enterprise.name;
      $('entResult').innerHTML = renderEntCard(res.enterprise);
      refreshStats();
      refreshMine();
    } catch (err) {
      toast(err.message || '提交失败', 3000);
    } finally {
      busy(btn, false);
      syncMarkBtn();
    }
  });

  /* =========================================================
     产品录入
     ========================================================= */
  function renderPicks(list) {
    const box = $('entPickList');
    if (!list.length) {
      box.innerHTML = `<div class="hint">没有匹配的企业，可在下方直接填写企业全称新建</div>`;
      return;
    }
    box.innerHTML = list.map(e => `
      <button class="pick" data-pick="${esc(e.id)}" data-pickname="${esc(e.name)}">
        <span class="badge b-${e.status}" style="font-size:11px;padding:3px 9px">${esc(R.STATUS_TEXT[e.status])}</span>
        <span class="pick-main">
          <span class="pick-name">${esc(e.name)}</span>
          <span class="pick-meta">${e.marksCount} 人认领 · ${e.products.length} 个产品</span>
        </span>
      </button>`).join('');
  }

  $('btnSearchEnt').addEventListener('click', async () => {
    const kw = $('inKeyword').value.trim();
    if (!kw) return toast('请输入企业名称关键词');
    $('entPickList').innerHTML = `<div class="skeleton">搜索中…</div>`;
    try {
      const list = await S.searchEnterprises(kw);
      renderPicks(list);
    } catch (err) {
      $('entPickList').innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body">${esc(err.message || err)}</div></div>`;
    }
  });
  $('inKeyword').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnSearchEnt').click(); });

  document.addEventListener('click', e => {
    const p = e.target.closest('.pick');
    if (!p) return;
    document.querySelectorAll('.pick').forEach(x => x.classList.remove('is-on'));
    p.classList.add('is-on');
    pickedEnt = { id: p.dataset.pick, name: p.dataset.pickname };
    $('inEntNew').value = pickedEnt.name;
  });

  $('btnSubmitProd').addEventListener('click', async () => {
    const barcode = $('inBarcode').value.trim();
    const brand = $('inBrand').value.trim();
    const entName = $('inEntNew').value.trim();
    const btn = $('btnSubmitProd');
    if (!barcode) return toast('请输入产品条形码');
    if (!brand) return toast('请输入产品品牌');
    if (!pickedEnt && !entName) return toast('请选择或输入所属企业');
    busy(btn, true, '提交中…');
    try {
      const res = await S.addProduct({
        barcode, brand,
        enterpriseId: pickedEnt ? pickedEnt.id : '',
        enterpriseName: entName
      });
      toast(res.mode === 'updated' ? '该条码已存在，已更新归属' : '产品已录入');
      $('prodInResult').innerHTML = chainHtml(res.product, res.enterprise) + enterpriseCard(res.enterprise);
      $('inBarcode').value = ''; $('inBrand').value = '';
      $('inKeyword').value = ''; $('inEntNew').value = '';
      $('entPickList').innerHTML = ''; pickedEnt = null;
      refreshStats();
    } catch (err) {
      toast(err.message || '提交失败', 3000);
    } finally {
      busy(btn, false);
    }
  });

  /* =========================================================
     我的认领
     ========================================================= */
  async function refreshMine() {
    const box = $('mineResult');
    try {
      const list = await S.myMarks();
      if (!list.length) {
        box.innerHTML = `<div class="empty"><span class="empty-ico">◇</span>
          <b>还没有你的认领记录</b><p>去「企业录入」认领一家企业，标记它的真实作息情况</p></div>`;
        return;
      }
      box.innerHTML = list.map(ent => enterpriseCard(ent, {
        noProducts: true,
        actions: `<div class="plist">
          <button class="btn btn-plain btn-sm" data-edit="${esc(ent.name)}" data-id="${esc(ent.id)}" data-opt="${ent.myOption}">修改我的标记</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(ent.id)}" data-name="${esc(ent.name)}">删除我的标记</button>
        </div>`
      })).join('');
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err"><span class="a-ico">!</span><div class="a-body"><b>读取失败</b>${esc(err.message || err)}</div></div>`;
    }
  }

  /* =========================================================
     全局点击分发（动态内容）
     ========================================================= */
  document.addEventListener('click', async e => {
    const t = e.target;

    const goto = t.closest('[data-goto]');
    if (goto) {
      const target = goto.dataset.goto;
      showTab(target);
      if (target === 'entIn' && goto.dataset.name) {
        $('inEntName').value = goto.dataset.name;
        syncMarkBtn();
        $('btnDup').click();
      }
      if (target === 'prodIn' && goto.dataset.code) $('inBarcode').value = goto.dataset.code;
      return;
    }

    const share = t.closest('[data-share]');
    if (share) {
      const url = location.origin + location.pathname + '#ent=' + encodeURIComponent(share.dataset.share);
      history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        toast('链接已复制，发给同事即可查看');
      } catch (err) {
        toast('已更新地址栏链接，可手动复制分享');
      }
      return;
    }

    const edit = t.closest('[data-edit]');
    if (edit) {
      showTab('entIn');
      $('inEntName').value = edit.dataset.edit;
      entOption = Number(edit.dataset.opt) || 0;
      document.querySelectorAll('#optList .opt').forEach(b =>
        b.classList.toggle('is-on', Number(b.dataset.opt) === entOption));
      syncMarkBtn();
      toast('已载入，改选后点「提交我的标记」即可更新');
      return;
    }

    const del = t.closest('[data-del]');
    if (del) {
      if (!confirm('确定删除你在「' + del.dataset.name + '」的标记吗？\n删除后该企业的状态会重新计算。')) return;
      try {
        await S.removeMark(del.dataset.del);
        toast('已删除');
        refreshMine();
        refreshStats();
      } catch (err) {
        toast(err.message || '删除失败', 3000);
      }
      return;
    }
  });

  /* =========================================================
     管理：扫描/清理恶意词条 + 备份恢复
     ========================================================= */
  function admKeyOk() {
    const key = $('admKey').value.trim();
    if (!key) { toast('请先输入管理密钥'); return false; }
    if (CFG.ADMIN_KEY && key !== CFG.ADMIN_KEY) { toast('管理密钥不正确'); return false; }
    return true;
  }

  $('btnAdmScan').addEventListener('click', async () => {
    if (!admKeyOk()) return;
    const box = $('admResult');
    box.innerHTML = `<div class="skeleton">扫描中…</div>`;
    try {
      const res = await S.adminScan($('admKeyword').value.trim());
      if (!res.suspicious.length) {
        box.innerHTML = `<div class="alert alert-ok" style="margin-top:12px"><span class="a-ico">✓</span>
          <div class="a-body"><b>没有发现可疑记录</b></div></div>`;
        return;
      }
      box.innerHTML = `<div class="alert alert-warn" style="margin-top:12px"><span class="a-ico">!</span>
        <div class="a-body"><b>发现 ${res.suspicious.length} 条可疑记录</b>
        删除会连带清除该企业的标记与产品，请核对名称后再操作。</div></div>`
        + res.suspicious.map(s => `
        <div class="adm-row">
          <span class="er-main">
            <span class="er-name">${esc(s.name) || '<i>(空名称)</i>'}</span>
            <span class="er-meta">${esc(s.id)} · ${s.marksCount} 条标记 · name 字段类型：${esc(s.nameType)}</span>
          </span>
          <button class="btn btn-danger btn-sm" data-admdel="${esc(s.id)}" data-admname="${esc(s.name)}">删除</button>
        </div>`).join('');
    } catch (err) {
      box.innerHTML = `<div class="alert alert-err" style="margin-top:12px"><span class="a-ico">!</span><div class="a-body">${esc(err.message || err)}</div></div>`;
    }
  });

  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-admdel]');
    if (!btn) return;
    if (!admKeyOk()) return;
    const name = btn.dataset.admname || btn.dataset.admdel;
    if (!confirm('确定删除「' + name + '」吗？\n该企业的全部标记和产品会被一并删除，且不可恢复。')) return;
    try {
      const r = await S.adminPurge({ ids: [btn.dataset.admdel], confirm: true });
      toast(r.total ? '已删除，连带清除了关联数据' : '未找到该记录');
      $('btnAdmScan').click();
      refreshStats();
      if (entQMode === 'tag') loadTagList();
    } catch (err) {
      toast(err.message || '删除失败', 3000);
    }
  });

  $('btnExport').addEventListener('click', () => {
    try {
      const blob = new Blob([S.exportLocal()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'shuangxiu-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('备份文件已下载，建议存到网盘一份');
    } catch (err) {
      toast(err.message || '导出失败', 3000);
    }
  });

  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      S.importLocal(await f.text());
      toast('导入成功，数据已恢复');
      refreshStats();
      refreshMine();
      if (entQMode === 'tag') loadTagList();
    } catch (err) {
      toast(err.message || '导入失败：文件格式不对', 3000);
    }
    e.target.value = '';
  });

  $('btnResetLocal').addEventListener('click', () => {
    if (!confirm('确定清空本机演示数据吗？\n此操作不可恢复，建议先「导出备份 JSON」。')) return;
    S.resetLocal();
    toast('本机数据已清空');
    refreshStats();
    refreshMine();
    if (entQMode === 'tag') loadTagList();
  });

  /* =========================================================
     统计 / 模式切换 / 启动
     ========================================================= */
  async function refreshStats() {
    try {
      const s = await S.stats();
      $('statEnt').textContent = s.totalEnterprises;
      $('statProd').textContent = s.totalProducts;
      $('statMark').textContent = s.totalMarks;
    } catch (e) {
      $('statEnt').textContent = $('statProd').textContent = $('statMark').textContent = '-';
    }
  }

  function paintMode() {
    const el = $('modeBadge');
    const cloud = S.mode === 'cloud';
    el.textContent = cloud ? '云端共享' : '本机演示';
    el.classList.toggle('is-cloud', cloud);
    el.title = cloud
      ? '当前连接云开发数据库，与小程序共用同一份数据。点击切换回本机演示。'
      : '当前数据只存在这台设备的浏览器里。点击尝试连接云开发数据库。';
  }

  $('modeBadge').addEventListener('click', async () => {
    const to = S.mode === 'cloud' ? 'local' : 'cloud';
    $('modeBadge').textContent = '切换中…';
    try {
      await S.switchTo(to);
      toast(to === 'cloud' ? '已连接云端，数据与小程序共享' : '已切换到本机演示数据');
    } catch (err) {
      toast(err.message || '切换失败', 3200);
    }
    paintMode();
    refreshStats();
    refreshMine();
  });

  /* 深链接：分享出去的地址可直达某个查询结果
     #tab=ent|prod|entIn|prodIn|mine
     #ent=企业全称        → 自动查这家企业
     #brand=品牌名        → 自动按品牌查产品
     #code=条形码         → 自动按条码查产品                         */
  function readHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return;
    const q = {};
    h.split('&').forEach(kv => {
      const i = kv.indexOf('=');
      if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });

    if (q.ent) {
      showTab('ent');
      $('entName').value = q.ent;
      doFindEnt();
      return;
    }
    if (q.enttag !== undefined) {
      showTab('ent');
      entTag = q.enttag || 'all';
      document.querySelector('[data-qmode="tag"]').click();
      return;
    }
    if (q.brand) {
      showTab('prod');
      document.querySelector('.sw[data-mode="brand"]').click();
      $('brand').value = q.brand;
      doFindBrand();
      return;
    }
    if (q.code) {
      showTab('prod');
      $('barcode').value = q.code;
      doFindCode();
      return;
    }
    if (q.tab) showTab(q.tab);
  }

  (async function boot() {
    try {
      await S.init();
    } catch (err) {
      toast(err.message || '初始化失败', 3200);
    }
    paintMode();
    if (S.mode === 'local') {
      setTimeout(() => toast('当前为本机演示数据，点右上角标签可连接云端', 3000), 600);
    }
    await refreshStats();
    refreshMine();
    readHash();
  })();
})();
