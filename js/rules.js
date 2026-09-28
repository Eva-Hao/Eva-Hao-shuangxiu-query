/* ===========================================================
   业务规则（与小程序云函数 cloudfunctions/api/index.js 完全一致）
   改规则时，两处要同步修改，否则网页与小程序结果会不一致。
   =========================================================== */
(function () {

  /* 状态：1 双休 / 2 非严格双休 / 3 非双休 / 0 未录入 */
  const STATUS_TEXT = { 1: '双休', 2: '非严格双休', 3: '非双休', 0: '未录入' };

  const STATUS_NOTE = {
    1: '判定依据：该企业全部认领人均标记为「严格双休」（5 天 8 小时工作时长）。',
    2: '判定依据：该企业存在「非严格双休」标记（5 天 8 小时但有加班，如无加班工资、仅能调休），且没有任何「非双休」标记。',
    3: '判定依据：该企业存在「非双休」标记（非 5 天 8 小时工作时长）。只要有一条，即判定为非双休。',
    0: '该企业尚无员工认领标记。在「企业录入」里认领并标记，即可为它建立作息档案。'
  };

  const OPTIONS = [
    { value: 1, key: 'opt-1', title: '严格双休', desc: '5 天 8 小时工作时长' },
    { value: 2, key: 'opt-2', title: '非严格双休', desc: '5 天 8 小时，有加班（无加班工资、仅能调休等）' },
    { value: 3, key: 'opt-3', title: '非双休', desc: '非 5 天 8 小时工作时长' }
  ];

  /* 汇总规则（需求原文）：
     - 全部为选项 1                -> 1 双休
     - 含选项 2 且不含选项 3        -> 2 非严格双休
     - 只要含 1 条选项 3            -> 3 非双休
     - 无人标记                    -> 0 未录入 */
  function computeStatus(marks) {
    if (!marks || !marks.length) return 0;
    if (marks.some(m => Number(m.option) === 3)) return 3;
    if (marks.some(m => Number(m.option) === 2)) return 2;
    return 1;
  }

  function countOptions(marks) {
    const c = { c1: 0, c2: 0, c3: 0 };
    (marks || []).forEach(m => {
      const v = Number(m.option);
      if (v === 1) c.c1++; else if (v === 2) c.c2++; else if (v === 3) c.c3++;
    });
    return c;
  }

  /* 把「企业 + 它的标记 + 它的产品」组装成页面用的视图模型 */
  function decorateEnterprise(ent, marks, products, me) {
    const ms = marks || [];
    const mine = ms.find(m => m.userKey === me);
    return {
      id: ent._id,
      name: ent.name,
      status: computeStatus(ms),
      statusText: STATUS_TEXT[computeStatus(ms)],
      note: STATUS_NOTE[computeStatus(ms)],
      marksCount: ms.length,
      counts: countOptions(ms),
      myOption: mine ? Number(mine.option) : 0,
      products: (products || []).map(p => ({ barcode: p.barcode, brand: p.brand }))
    };
  }

  /* 兜底：企业不存在时也给一个「未录入」的视图模型 */
  function unknownEnterprise(name) {
    return {
      id: '', name, status: 0, statusText: STATUS_TEXT[0], note: STATUS_NOTE[0],
      marksCount: 0, counts: { c1: 0, c2: 0, c3: 0 }, myOption: 0, products: []
    };
  }

  /* ==========================================================
     录入校验（与小程序云函数 ENT_NAME_* 规则完全一致，2026-09-25 起）
       ① ≥4 字且非纯字母数字短串
       ② 必须含企业类后缀（企业全称门槛）
       ③ 政治性/政权类敏感词一律拒绝
       ④ 国家/地区类词仅放行完整企业名（含 有限公司|股份|集团|银行 且 ≥8 字）
     ========================================================== */
  const ENT_NAME_BLOCKED = /党|民国|共和国|共产|政府|国务院|军委|国防|军队|解放军|武警|军区|主席|总统|议会|国会|人大|政协|团委|妇联|工会|机关|部委|联合国|北约|邪教|法轮|纳粹/;
  const ENT_NAME_REGION = /中国|国家|中央|中华|美国|美利坚|日本|英国|法国|德国|俄国|俄罗斯|韩国|朝鲜|印度|越南|泰国|缅甸|菲律宾|印尼|加拿大|澳大利亚|巴西|非洲|欧洲|亚洲|台湾|香港|澳门|西藏|新疆/;
  const ENT_NAME_SUFFIX = /有限公司|有限责任公司|股份|集团|总公司|公司|银行|事务所|研究院|研究所|设计院|工作室|中心|厂|医院|学校|大学|学院/;

  function isValidEntName(name) {
    const n = String(name || '').trim();
    if (!n || n.length < 4) return false;
    if (/^[\s\dA-Za-z_.\-]+$/.test(n)) return false;
    if (ENT_NAME_BLOCKED.test(n)) return false;
    if (!ENT_NAME_SUFFIX.test(n)) return false;
    if (ENT_NAME_REGION.test(n)) {
      return /(有限公司|股份|集团|银行)/.test(n) && n.length >= 8;
    }
    return true;
  }

  function entNameError() {
    return '企业名称不合规：仅支持录入企业全称（须含「有限公司」「集团」「事务所」等字样，4 字以上），禁止录入国家、政党、政府机构等非企业名称';
  }

  window.Rules = {
    STATUS_TEXT, STATUS_NOTE, OPTIONS,
    computeStatus, countOptions, decorateEnterprise, unknownEnterprise,
    isValidEntName, entNameError
  };
})();
