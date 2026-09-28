/* ===========================================================
   数据层：一套接口，两种数据源
     Local —— localStorage（本机演示）
     Cloud —— 微信云开发数据库（@cloudbase/js-sdk + 匿名登录）
   两个数据源的方法名与返回结构完全一致，页面代码不用关心用哪个。
   =========================================================== */
(function () {
  const CFG = window.APP_CONFIG;
  const R = window.Rules;
  const LS_KEY = 'shuangxiu_data_v1';
  const LS_UID = 'shuangxiu_user_key';

  const clone = o => JSON.parse(JSON.stringify(o));
  const now = () => Date.now();

  function uuid(p) {
    const s = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
    return p + '-' + s;
  }

  /* =========================================================
     数据源一：本机（localStorage）
     ========================================================= */
  const Local = {
    name: 'local',

    db: { enterprises: [], marks: [], products: [] },

    init() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { raw = null; }
      if (!raw || !Array.isArray(raw.enterprises)) {
        this.db = seed();
        this.save();
      } else {
        this.db = raw;
      }
      const k = localStorage.getItem(LS_UID) || uuid('u');
      localStorage.setItem(LS_UID, k);
      this.uid = k;
      return Promise.resolve();
    },

    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.db)); } catch (e) { /* 隐私模式忽略 */ }
    },

    /* 只用于演示：一键清空 */
    reset() {
      this.db = { enterprises: [], marks: [], products: [] };
      this.save();
    },

    _ent(id) { return this.db.enterprises.find(e => e._id === id) || null; },

    _view(ent) {
      const marks = this.db.marks.filter(m => m.enterpriseId === ent._id);
      const prods = this.db.products.filter(p => p.enterpriseId === ent._id);
      return R.decorateEnterprise(ent, marks, prods, this.uid);
    },

    async stats() {
      return {
        totalEnterprises: this.db.enterprises.length,
        totalProducts: this.db.products.length,
        totalMarks: this.db.marks.length
      };
    },

    async findEnterprise(name) {
      const kw = String(name || '').trim();
      if (!kw) throw new Error('请输入企业全称');
      const ent = this.db.enterprises.find(e => e.name === kw);
      if (!ent) return { found: false, name: kw };
      return { found: true, enterprise: this._view(ent) };
    },

    async searchEnterprises(keyword) {
      const kw = String(keyword || '').trim().toLowerCase();
      if (!kw) return [];
      return this.db.enterprises
        .filter(e => e.name.toLowerCase().includes(kw))
        .slice(0, CFG.QUERY_LIMIT)
        .map(e => this._view(e));
    },

    /* 多维检索：keyword 模糊 + status 标签筛选，返回 {list, counts, total} */
    async listEnterprises({ keyword, status, limit } = {}) {
      const kw = String(keyword || '').trim().toLowerCase();
      const hasStatus = status !== undefined && status !== null && status !== '' && status !== 'all';
      const st = hasStatus ? Number(status) : -1;
      const views = this.db.enterprises.map(e => this._view(e));
      const counts = { s0: 0, s1: 0, s2: 0, s3: 0 };
      views.forEach(v => { counts['s' + v.status]++; });

      let matched = views;
      if (kw) matched = matched.filter(v => v.name.toLowerCase().includes(kw));
      if (hasStatus && [0, 1, 2, 3].includes(st)) matched = matched.filter(v => v.status === st);

      matched.sort((a, b) => {
        if (kw) {
          const rank = n => (n === kw ? 0 : n.indexOf(kw) === 0 ? 1 : 2);
          const ra = rank(a.name.toLowerCase()), rb = rank(b.name.toLowerCase());
          if (ra !== rb) return ra - rb;
        }
        if (b.marksCount !== a.marksCount) return b.marksCount - a.marksCount;
        return a.name.localeCompare(b.name, 'zh');
      });

      const max = Math.min(Number(limit) || 50, 100);
      return { ok: true, total: matched.length, counts, list: matched.slice(0, max) };
    },

    /* 管理端：诊断可疑记录（name 异常或命中关键词） */
    async adminScan(keyword) {
      const kw = String(keyword || '').trim();
      const suspicious = this.db.enterprises
        .map(e => ({
          id: e._id,
          name: typeof e.name === 'string' ? e.name : JSON.stringify(e.name || null),
          nameType: e.name === null ? 'null' : typeof e.name,
          marksCount: this.db.marks.filter(m => m.enterpriseId === e._id).length
        }))
        .filter(e => e.nameType !== 'string' || !e.name || (kw && e.name.indexOf(kw) > -1));
      return { ok: true, suspicious };
    },

    /* 管理端：按 ids/关键词删除企业（连带标记与产品） */
    async adminPurge({ ids, keyword, confirm } = {}) {
      let targets = [];
      if (Array.isArray(ids) && ids.length) {
        targets = this.db.enterprises.filter(e => ids.map(String).includes(e._id));
      } else {
        const kw = String(keyword || '').trim();
        if (!kw) throw new Error('请输入关键词或提供 ids');
        targets = this.db.enterprises.filter(e => typeof e.name === 'string' && e.name === kw);
      }
      if (!confirm) return { ok: true, confirm: false, matched: targets.map(e => ({ id: e._id, name: e.name })) };
      const detail = targets.map(e => {
        const before = this.db.marks.length, beforeP = this.db.products.length;
        this.db.marks = this.db.marks.filter(m => m.enterpriseId !== e._id);
        this.db.products = this.db.products.filter(p => p.enterpriseId !== e._id);
        this.db.enterprises = this.db.enterprises.filter(x => x._id !== e._id);
        return { id: e._id, name: e.name, marksRemoved: before - this.db.marks.length, productsRemoved: beforeP - this.db.products.length };
      });
      this.save();
      return { ok: true, confirm: true, total: detail.length, deleted: detail };
    },

    /* 备份 / 恢复（本机数据导出为 JSON，可再导入） */
    exportLocal() { return JSON.stringify(this.db); },
    importLocal(json) {
      const data = JSON.parse(json);
      if (!data || !Array.isArray(data.enterprises)) throw new Error('文件格式不对：缺少 enterprises 数组');
      this.db = { enterprises: data.enterprises, marks: data.marks || [], products: data.products || [] };
      this.save();
    },

    async setMark({ name, enterpriseId, option }) {
      const opt = Number(option);
      if (![1, 2, 3].includes(opt)) throw new Error('请选择双休情况');

      let ent = enterpriseId ? this._ent(enterpriseId) : null;
      if (!ent) {
        const kw = String(name || '').trim();
        if (!kw) throw new Error('请输入企业全称');
        ent = this.db.enterprises.find(e => e.name === kw);
        if (!ent) {
          if (!R.isValidEntName(kw)) throw new Error(R.entNameError());
          ent = { _id: uuid('e'), name: kw, createdAt: now() };
          this.db.enterprises.push(ent);
        }
      }
      // 同一用户对同一企业只保留一条标记
      const mine = this.db.marks.find(m => m.enterpriseId === ent._id && m.userKey === this.uid);
      if (mine) {
        mine.option = opt;
        mine.updatedAt = now();
      } else {
        this.db.marks.push({
          _id: uuid('m'), enterpriseId: ent._id, userKey: this.uid,
          option: opt, createdAt: now(), updatedAt: now()
        });
      }
      this.save();
      return { ok: true, enterprise: this._view(ent) };
    },

    async removeMark(enterpriseId) {
      const i = this.db.marks.findIndex(m => m.enterpriseId === enterpriseId && m.userKey === this.uid);
      if (i < 0) throw new Error('未找到你的标记');
      this.db.marks.splice(i, 1);
      this.save();
      const ent = this._ent(enterpriseId);
      return { ok: true, enterprise: ent ? this._view(ent) : null };
    },

    async myMarks() {
      const mine = this.db.marks
        .filter(m => m.userKey === this.uid)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return mine.map(m => this._ent(m.enterpriseId)).filter(Boolean).map(e => this._view(e));
    },

    async queryProductByBarcode(barcode) {
      const code = String(barcode || '').trim();
      if (!code) throw new Error('请扫描或输入产品条形码');
      const p = this.db.products.find(x => x.barcode === code);
      if (!p) return { found: false, barcode: code };
      const ent = this._ent(p.enterpriseId);
      return {
        found: true,
        product: { barcode: p.barcode, brand: p.brand },
        enterprise: ent ? this._view(ent) : R.unknownEnterprise('未知企业')
      };
    },

    async queryProductByBrand(brand) {
      const kw = String(brand || '').trim().toLowerCase();
      if (!kw) throw new Error('请输入品牌名称');
      const list = this.db.products
        .filter(p => p.brand.toLowerCase().includes(kw))
        .slice(0, CFG.QUERY_LIMIT)
        .map(p => {
          const ent = this._ent(p.enterpriseId);
          return { barcode: p.barcode, brand: p.brand, enterprise: ent ? this._view(ent) : null };
        });
      if (!list.length) return { found: false, brand: String(brand).trim() };
      return { found: true, brand: String(brand).trim(), list };
    },

    async addProduct({ barcode, brand, enterpriseId, enterpriseName }) {
      const code = String(barcode || '').trim();
      const bd = String(brand || '').trim();
      if (!code) throw new Error('请输入产品条形码');
      if (!bd) throw new Error('请输入产品品牌');

      let ent = enterpriseId ? this._ent(enterpriseId) : null;
      if (!ent) {
        const nm = String(enterpriseName || '').trim();
        if (!nm) throw new Error('请选择或输入所属企业');
        ent = this.db.enterprises.find(e => e.name === nm);
        if (!ent) {
          if (!R.isValidEntName(nm)) throw new Error(R.entNameError());
          ent = { _id: uuid('e'), name: nm, createdAt: now() };
          this.db.enterprises.push(ent);
        }
      }

      const existed = this.db.products.find(p => p.barcode === code);
      let mode = 'created';
      if (existed) {
        mode = 'updated';
        existed.brand = bd;
        existed.enterpriseId = ent._id;
        existed.updatedAt = now();
        existed.updatedBy = this.uid;
      } else {
        this.db.products.push({
          _id: uuid('p'), barcode: code, brand: bd, enterpriseId: ent._id,
          createdAt: now(), createdBy: this.uid
        });
      }
      this.save();
      return { ok: true, mode, product: { barcode: code, brand: bd }, enterprise: this._view(ent) };
    }
  };

  /* 首次打开时塞一点演示数据，方便看到界面效果（可一键清空） */
  function seed() {
    const t = now();
    const mk = (id, name) => ({ _id: id, name, createdAt: t });
    return {
      enterprises: [
        mk('e-demo-1', '农夫山泉股份有限公司'),
        mk('e-demo-2', '华为技术有限公司'),
        mk('e-demo-3', '深圳市腾讯计算机系统有限公司'),
        mk('e-demo-4', '内蒙古蒙牛乳业（集团）股份有限公司')
      ],
      marks: [
        { _id: 'm-1', enterpriseId: 'e-demo-1', userKey: 'demo-a', option: 1, updatedAt: t },
        { _id: 'm-2', enterpriseId: 'e-demo-1', userKey: 'demo-b', option: 1, updatedAt: t },
        { _id: 'm-3', enterpriseId: 'e-demo-1', userKey: 'demo-c', option: 1, updatedAt: t },
        { _id: 'm-4', enterpriseId: 'e-demo-2', userKey: 'demo-a', option: 3, updatedAt: t },
        { _id: 'm-5', enterpriseId: 'e-demo-2', userKey: 'demo-b', option: 2, updatedAt: t },
        { _id: 'm-6', enterpriseId: 'e-demo-3', userKey: 'demo-a', option: 1, updatedAt: t },
        { _id: 'm-7', enterpriseId: 'e-demo-3', userKey: 'demo-b', option: 2, updatedAt: t }
      ],
      products: [
        { _id: 'p-1', barcode: '6901234567890', brand: '农夫山泉', enterpriseId: 'e-demo-1' },
        { _id: 'p-2', barcode: '6921168555841', brand: '东方树叶', enterpriseId: 'e-demo-1' },
        { _id: 'p-3', barcode: '6907992100138', brand: '蒙牛纯牛奶', enterpriseId: 'e-demo-4' },
        { _id: 'p-4', barcode: '6902083888888', brand: '农夫山泉 · 天然矿泉水', enterpriseId: 'e-demo-1' }
      ]
    };
  }

  /* =========================================================
     数据源二：微信云开发数据库
     ========================================================= */
  const Cloud = {
    name: 'cloud',
    ready: false,

    /* 动态加载 SDK（按 CDN 列表依次尝试） */
    loadSDK() {
      if (window.cloudbase) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const list = CFG.SDK_CDN.slice();
        (function next() {
          if (!list.length) return reject(new Error('云开发 SDK 加载失败，请检查网络或 CDN 地址'));
          const url = list.shift();
          const s = document.createElement('script');
          s.src = url;
          s.onload = () => window.cloudbase ? resolve() : next();
          s.onerror = next;
          document.head.appendChild(s);
        })();
      });
    },

    async init() {
      await this.loadSDK();
      this.app = window.cloudbase.init({ env: CFG.CLOUD_ENV });
      this.auth = this.app.auth();

      // 匿名登录：每个浏览器一个独立身份，用来区分"谁的标记"
      let state = null;
      try { state = await this.auth.getLoginState(); } catch (e) { state = null; }
      if (!state) await this.auth.signInAnonymously();

      let user = this.auth.currentUser;
      if (!user) {
        try { user = await this.auth.getCurrentUser(); } catch (e) { user = null; }
      }
      this.uid = (user && (user.uid || user.id)) || '';
      if (!this.uid) throw new Error('匿名登录失败，请确认云开发已开启匿名登录');

      this.db = this.app.database();
      this.$ = this.db.command;
      this.ready = true;
    },

    col(k) { return this.db.collection(CFG.COLLECTIONS[k]); },

    _view(ent, marks, products) {
      return R.decorateEnterprise(ent, marks, products, this.uid);
    },

    /* 批量取某批企业的标记与产品（各一次查询） */
    async _marksAndProducts(ids) {
      if (!ids.length) return { marks: [], products: [] };
      const [$] = [this.$];
      const [m, p] = await Promise.all([
        this.col('mark').where({ enterpriseId: $.in(ids) }).limit(CFG.QUERY_LIMIT).get(),
        this.col('product').where({ enterpriseId: $.in(ids) }).limit(CFG.QUERY_LIMIT).get()
      ]);
      return { marks: m.data || [], products: p.data || [] };
    },

    async stats() {
      const safe = p => p.then(r => r.total || 0).catch(() => 0);
      const [a, b, c] = await Promise.all([
        safe(this.col('enterprise').count()),
        safe(this.col('product').count()),
        safe(this.col('mark').count())
      ]);
      return { totalEnterprises: a, totalProducts: b, totalMarks: c };
    },

    async findEnterprise(name) {
      const kw = String(name || '').trim();
      if (!kw) throw new Error('请输入企业全称');
      const res = await this.col('enterprise').where({ name: kw }).limit(1).get();
      const ent = (res.data || [])[0];
      if (!ent) return { found: false, name: kw };
      const { marks, products } = await this._marksAndProducts([ent._id]);
      return { found: true, enterprise: this._view(ent, marks, products) };
    },

    async searchEnterprises(keyword) {
      const kw = String(keyword || '').trim();
      if (!kw) return [];
      const res = await this.col('enterprise')
        .where({ name: this.db.RegExp({ regexp: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' }) })
        .limit(CFG.QUERY_LIMIT)
        .get();
      const ents = res.data || [];
      if (!ents.length) return [];
      const { marks, products } = await this._marksAndProducts(ents.map(e => e._id));
      return ents.map(e => this._view(
        e,
        marks.filter(m => m.enterpriseId === e._id),
        products.filter(p => p.enterpriseId === e._id)
      ));
    },

    /* 分页拉全表（云开发客户端单次上限，循环取到没有更多为止，封顶 1000） */
    async _fetchAll(k) {
      const out = [];
      const size = CFG.QUERY_LIMIT;
      for (let skip = 0; skip < 1000; skip += size) {
        const r = await this.col(k).skip(skip).limit(size).get();
        out.push(...(r.data || []));
        if ((r.data || []).length < size) break;
      }
      return out;
    },

    /* 多维检索：keyword 模糊 + status 标签筛选（全量计算，与小程序云函数一致） */
    async listEnterprises({ keyword, status, limit } = {}) {
      const kw = String(keyword || '').trim().toLowerCase();
      const hasStatus = status !== undefined && status !== null && status !== '' && status !== 'all';
      const st = hasStatus ? Number(status) : -1;

      const [ents, marks] = await Promise.all([this._fetchAll('enterprise'), this._fetchAll('mark')]);
      const byEnt = new Map();
      marks.forEach(m => {
        const arr = byEnt.get(m.enterpriseId);
        if (arr) arr.push(m); else byEnt.set(m.enterpriseId, [m]);
      });

      const counts = { s0: 0, s1: 0, s2: 0, s3: 0 };
      const all = ents.map(e => {
        const ms = byEnt.get(e._id) || [];
        const v = R.decorateEnterprise(e, ms, [], this.uid);
        counts['s' + v.status]++;
        return v;
      });

      let matched = all;
      if (kw) matched = matched.filter(v => v.name.toLowerCase().includes(kw));
      if (hasStatus && [0, 1, 2, 3].includes(st)) matched = matched.filter(v => v.status === st);

      matched.sort((a, b) => {
        if (kw) {
          const rank = n => (n === kw ? 0 : n.indexOf(kw) === 0 ? 1 : 2);
          const ra = rank(a.name.toLowerCase()), rb = rank(b.name.toLowerCase());
          if (ra !== rb) return ra - rb;
        }
        if (b.marksCount !== a.marksCount) return b.marksCount - a.marksCount;
        return a.name.localeCompare(b.name, 'zh');
      });

      const max = Math.min(Number(limit) || 50, 100);
      const page = matched.slice(0, max);
      if (page.length) {
        const { products } = await this._marksAndProducts(page.map(v => v.id));
        page.forEach(v => {
          v.products = products.filter(p => p.enterpriseId === v.id)
            .map(p => ({ barcode: p.barcode, brand: p.brand }));
        });
      }
      return { ok: true, total: matched.length, counts, list: page };
    },

    /* 管理端（云端模式为尽力而为：需集合权限允许，否则会收到权限报错） */
    async adminScan(keyword) {
      const kw = String(keyword || '').trim();
      const ents = await this._fetchAll('enterprise');
      const marks = await this._fetchAll('mark');
      const cnt = {};
      marks.forEach(m => { cnt[m.enterpriseId] = (cnt[m.enterpriseId] || 0) + 1; });
      const suspicious = ents
        .map(e => ({
          id: e._id,
          name: typeof e.name === 'string' ? e.name : JSON.stringify(e.name || null),
          nameType: e.name === null ? 'null' : typeof e.name,
          marksCount: cnt[e._id] || 0
        }))
        .filter(e => e.nameType !== 'string' || !e.name || (kw && e.name.indexOf(kw) > -1));
      return { ok: true, suspicious };
    },

    async adminPurge({ ids, keyword, confirm } = {}) {
      let targets = [];
      if (Array.isArray(ids) && ids.length) {
        const r = await this.col('enterprise').where({ _id: this.$.in(ids.map(String)) }).limit(100).get();
        targets = r.data || [];
      } else {
        const kw = String(keyword || '').trim();
        if (!kw) throw new Error('请输入关键词或提供 ids');
        const r = await this.col('enterprise').where({ name: kw }).limit(100).get();
        targets = r.data || [];
      }
      if (!confirm) return { ok: true, confirm: false, matched: targets.map(e => ({ id: e._id, name: e.name })) };
      const detail = [];
      for (const e of targets) {
        await this.col('mark').where({ enterpriseId: e._id }).remove().catch(() => {});
        await this.col('product').where({ enterpriseId: e._id }).remove().catch(() => {});
        await this.col('enterprise').doc(e._id).remove().catch(() => {});
        detail.push({ id: e._id, name: e.name });
      }
      return { ok: true, confirm: true, total: detail.length, deleted: detail };
    },

    /* 找企业，没有就建（录入场景共用） */
    async _ensureEnterprise(enterpriseId, name) {
      if (enterpriseId) {
        const r = await this.col('enterprise').doc(enterpriseId).get().catch(() => null);
        if (r && r.data) return Array.isArray(r.data) ? r.data[0] : r.data;
      }
      const kw = String(name || '').trim();
      if (!kw) throw new Error('请输入企业全称');
      const res = await this.col('enterprise').where({ name: kw }).limit(1).get();
      const hit = (res.data || [])[0];
      if (hit) return hit;
      if (!R.isValidEntName(kw)) throw new Error(R.entNameError());
      const add = await this.col('enterprise').add({ name: kw, createdAt: this.db.serverDate() });
      return { _id: add.id || (add.ids && add.ids[0]), name: kw };
    },

    async setMark({ name, enterpriseId, option }) {
      const opt = Number(option);
      if (![1, 2, 3].includes(opt)) throw new Error('请选择双休情况');
      const ent = await this._ensureEnterprise(enterpriseId, name);

      const exists = await this.col('mark')
        .where({ enterpriseId: ent._id, userKey: this.uid }).limit(1).get();
      const hit = (exists.data || [])[0];
      if (hit) {
        await this.col('mark').doc(hit._id).update({ option: opt, updatedAt: this.db.serverDate() });
      } else {
        await this.col('mark').add({
          enterpriseId: ent._id, userKey: this.uid, option: opt,
          createdAt: this.db.serverDate(), updatedAt: this.db.serverDate()
        });
      }
      const { marks, products } = await this._marksAndProducts([ent._id]);
      return { ok: true, enterprise: this._view(ent, marks, products) };
    },

    async removeMark(enterpriseId) {
      const res = await this.col('mark')
        .where({ enterpriseId, userKey: this.uid }).limit(1).get();
      const hit = (res.data || [])[0];
      if (!hit) throw new Error('未找到你的标记');
      await this.col('mark').doc(hit._id).remove();
      const [er, mp] = await Promise.all([
        this.col('enterprise').doc(enterpriseId).get().catch(() => null),
        this._marksAndProducts([enterpriseId])
      ]);
      const ent = er && (Array.isArray(er.data) ? er.data[0] : er.data);
      return { ok: true, enterprise: ent ? this._view(ent, mp.marks, mp.products) : null };
    },

    async myMarks() {
      const res = await this.col('mark')
        .where({ userKey: this.uid })
        .orderBy('updatedAt', 'desc')
        .limit(CFG.QUERY_LIMIT)
        .get();
      const marks = res.data || [];
      if (!marks.length) return [];
      const ids = [...new Set(marks.map(m => m.enterpriseId))];
      const [er, mp] = await Promise.all([
        this.col('enterprise').where({ _id: this.$.in(ids) }).limit(CFG.QUERY_LIMIT).get(),
        this._marksAndProducts(ids)
      ]);
      const byId = new Map((er.data || []).map(e => [e._id, e]));
      return marks
        .map(m => byId.get(m.enterpriseId))
        .filter(Boolean)
        .map(e => this._view(
          e,
          mp.marks.filter(m => m.enterpriseId === e._id),
          mp.products.filter(p => p.enterpriseId === e._id)
        ));
    },

    async queryProductByBarcode(barcode) {
      const code = String(barcode || '').trim();
      if (!code) throw new Error('请扫描或输入产品条形码');
      const res = await this.col('product').where({ barcode: code }).limit(1).get();
      const p = (res.data || [])[0];
      if (!p) return { found: false, barcode: code };
      const er = await this.col('enterprise').doc(p.enterpriseId).get().catch(() => null);
      const ent = er && (Array.isArray(er.data) ? er.data[0] : er.data);
      const mp = ent ? await this._marksAndProducts([ent._id]) : { marks: [], products: [] };
      return {
        found: true,
        product: { barcode: p.barcode, brand: p.brand },
        enterprise: ent ? this._view(ent, mp.marks, mp.products) : R.unknownEnterprise('未知企业')
      };
    },

    async queryProductByBrand(brand) {
      const kw = String(brand || '').trim();
      if (!kw) throw new Error('请输入品牌名称');
      const res = await this.col('product')
        .where({ brand: this.db.RegExp({ regexp: kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' }) })
        .limit(CFG.QUERY_LIMIT)
        .get();
      const ps = res.data || [];
      if (!ps.length) return { found: false, brand: kw };
      const ids = [...new Set(ps.map(p => p.enterpriseId))];
      const [er, mp] = await Promise.all([
        this.col('enterprise').where({ _id: this.$.in(ids) }).limit(CFG.QUERY_LIMIT).get(),
        this._marksAndProducts(ids)
      ]);
      const byId = new Map((er.data || []).map(e => [e._id, e]));
      return {
        found: true,
        brand: kw,
        list: ps.map(p => {
          const e = byId.get(p.enterpriseId);
          return {
            barcode: p.barcode, brand: p.brand,
            enterprise: e ? this._view(
              e,
              mp.marks.filter(m => m.enterpriseId === e._id),
              mp.products.filter(p2 => p2.enterpriseId === e._id)
            ) : null
          };
        })
      };
    },

    async addProduct({ barcode, brand, enterpriseId, enterpriseName }) {
      const code = String(barcode || '').trim();
      const bd = String(brand || '').trim();
      if (!code) throw new Error('请输入产品条形码');
      if (!bd) throw new Error('请输入产品品牌');
      const ent = await this._ensureEnterprise(enterpriseId, enterpriseName);

      const exists = await this.col('product').where({ barcode: code }).limit(1).get();
      const hit = (exists.data || [])[0];
      let mode = 'created';
      if (hit) {
        mode = 'updated';
        await this.col('product').doc(hit._id).update({
          brand: bd, enterpriseId: ent._id,
          updatedAt: this.db.serverDate(), updatedBy: this.uid
        });
      } else {
        await this.col('product').add({
          barcode: code, brand: bd, enterpriseId: ent._id,
          createdAt: this.db.serverDate(), createdBy: this.uid
        });
      }
      const mp = await this._marksAndProducts([ent._id]);
      return {
        ok: true, mode,
        product: { barcode: code, brand: bd },
        enterprise: this._view(ent, mp.marks, mp.products)
      };
    }
  };

  /* =========================================================
     对外统一入口
     ========================================================= */
  const DRIVERS = { local: Local, cloud: Cloud };
  let current = null;

  window.Store = {
    get mode() { return current ? current.name : CFG.DATA_SOURCE; },
    get uid() { return current ? current.uid : ''; },

    async init() {
      const want = CFG.DATA_SOURCE === 'cloud' ? Cloud : Local;
      try {
        await want.init();
        current = want;
      } catch (err) {
        if (want === Cloud) {
          console.warn('[双休查询] 云端初始化失败，已回退到本机演示数据：', err);
          CFG.DATA_SOURCE = 'local';
          await Local.init();
          current = Local;
          throw Object.assign(new Error('云端连接失败，已切换到本机演示数据'), { fallback: true });
        }
        throw err;
      }
      return current.name;
    },

    async switchTo(mode) {
      CFG.DATA_SOURCE = mode;
      await window.Store.init();
      return current.name;
    },

    resetLocal() { Local.reset(); },
    local: Local,
    cloud: Cloud,

    stats: (...a) => current.stats(...a),
    findEnterprise: (...a) => current.findEnterprise(...a),
    searchEnterprises: (...a) => current.searchEnterprises(...a),
    listEnterprises: (...a) => current.listEnterprises(...a),
    adminScan: (...a) => current.adminScan(...a),
    adminPurge: (...a) => current.adminPurge(...a),
    exportLocal: () => Local.exportLocal(),
    importLocal: (...a) => Local.importLocal(...a),
    setMark: (...a) => current.setMark(...a),
    removeMark: (...a) => current.removeMark(...a),
    myMarks: (...a) => current.myMarks(...a),
    queryProductByBarcode: (...a) => current.queryProductByBarcode(...a),
    queryProductByBrand: (...a) => current.queryProductByBrand(...a),
    addProduct: (...a) => current.addProduct(...a)
  };
})();
