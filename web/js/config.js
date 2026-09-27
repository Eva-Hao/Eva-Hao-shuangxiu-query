/* ===========================================================
   配置
   =========================================================== */
window.APP_CONFIG = {

  /* -----------------------------------------------------------
     数据源模式：
       'local' —— 数据存在浏览器本地（localStorage）。
                  打开即用，适合先看效果、做演示。
       'cloud' —— 连接微信云开发数据库，与小程序共用同一份数据。
                  需要先按 README 完成 3 步配置（见 web/README-WEB.md）。

     页头右上角的小标签可以直接点击切换模式，方便对比调试。
     ----------------------------------------------------------- */
  DATA_SOURCE: 'local',

  /* 云开发环境 ID（与小程序 miniprogram/app.js 中的一致） */
  CLOUD_ENV: 'cloud1-d6gt31i4e96f6ac11',

  /* CloudBase Web SDK 的 CDN 地址，按顺序尝试，第一个成功即用 */
  SDK_CDN: [
    'https://static.cloudbase.net/cloudbase-js-sdk/2.17.3/cloudbase.full.js',
    'https://static.cloudbase.net/cloudbase-js-sdk/2.10.0/cloudbase.full.js',
    'https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.7.2/cloudbase.full.js'
  ],

  /* 集合名（与小程序一致，不要改） */
  COLLECTIONS: {
    enterprise: 'enterprises',
    mark: 'marks',
    product: 'products'
  },

  /* 单次查询返回条数上限。
     Web 端直连数据库时，一次最多取 20 条（这是云开发的客户端限制）。
     数据量大之后建议改走云函数（上限 1000 条），README 里有说明。 */
  QUERY_LIMIT: 20,

  /* 管理页密钥（adminScan / adminPurge 用）。
     - local 模式：数据只在本机浏览器，留空 '' 表示任意密钥可用；
     - cloud 模式：必须与这里设置的值一致才放行。
     开源/部署前请改成自己的值，不要用示例值。 */
  ADMIN_KEY: ''
};
