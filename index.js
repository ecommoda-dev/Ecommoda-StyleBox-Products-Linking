// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// Worker: stylebox-products-linking-worker — EcomModa
// Tool:   Ecommoda StyleBox Products Linking
// Account: ecommoda-dev.workers.dev
// skills: worker-builder v1.0.0 · woocommerce-sync-helper v1.0.0 · html-builder v1.0.0 — 27-08-2026
//
// ⚠️ v2.7.0 (27-08-2026) — حارس جديد إلزامي على أكشن find_product (خطوة 1 في
//   الواجهة)، بطلب صاحب الأداة: قبل أي بحث في ووكومرس، الـ Worker بيتحقق أول
//   حاجة من metafield custom.wordpress_id على منتج شوبيفاي المطلوب — لو فيها
//   قيمة (مش فاضية)، يبقى المنتج ده اتربط قبل كده، وبيرجع
//   {ok:true, alreadyLinked:true, wordpressId, productTitle} بدل ما يكمل بحث
//   WC عادي. الواجهة بتعرض رسالة "هذا المنتج تم ربطه من قبل" ومتفتحش خطوة
//   الربط خالص. لو المنتج لسه مش مربوط، السلوك زي ما هو بالظبط (نفس بحث
//   findWcProductByShopifyId). راجع checkShopifyAlreadyLinked()/
//   PRODUCT_WPID_CHECK_QUERY في §FIND.
//
// ⚠️ v2.6.0 (27-08-2026) — تعديلان جديدان إلزاميان في syncProduct، بطلب صاحب الأداة:
//   1) حارس البراند (قبل أي كتابة): الـ Vendor على شوبيفاي لازم يكون له براند
//      بنفس الاسم بالظبط (case-insensitive) على تاكسونومي product_brand في
//      ووردبريس. لو مفيش، الربط بالكامل بيتوقف من غير أي كتابة على أي منصة —
//      رد مُبنيَن {code:'brand_missing', vendor, addBrandUrl} (HTTP 409) عشان
//      الواجهة تعرض نافذة خطأ فيها زرار "إضافة البراند على StyleBox" يفتح
//      /wp-admin/edit-tags.php?taxonomy=product_brand&post_type=product. لو
//      البراند موجود بيتربط بالمنتج (brands:[{id}]) في نفس نداء status=publish.
//      Vendor فاضي على شوبيفاي = الحارس بيتخطّى (مفيش حاجة تتطابق أصلاً).
//      راجع BrandNotFoundError/wcFindBrandByName/wcSearchBrands.
//   2) تصحيح الـ Slug إلزامي بدون خيار: الـ Slug بتاع منتج ووردبريس لازم يطابق
//      عنوانه (slugify(wooProduct.name)) — لو مختلف بيتصلّح في نفس نداء
//      status=publish. راجع slugify()/slugFixed.
//   ⚠️ الاتنين مش متأكَّدين فعليًا ضد stylebox.online وقت الكتابة (زي فلتر
//   global_unique_id قبل التأكيد) — راجع "مسائل مفتوحة" في CLAUDE.md، خصوصًا
//   افتراض إن /wc/v3/products/brands شغّال (تاكسونومي البراندات الأصلي في
//   ووكومرس 9.4+).
//
// ⚠️ RENAME — 25-08-2026: هذا الملف كان shopify-woo-sync-worker (tool =
// shopify_woo_sync). اتعمل رينيم كامل + مراجعة شاملة مقابل ecommoda-worker-builder
// وwoocommerce-sync-helper الحاليين. راجع الملخّص المرفق مع التسليم لتفاصيل كل
// تغيير وترتيب النشر (SQL في D1 الأول، بعدين النشر — ecommoda-tool-rename).
//
// PURPOSE:
// For every WooCommerce variable product linked to a Shopify product
// (link = WooCommerce product-level "global_unique_id" field holding
// the Shopify Product numeric ID), sync each variation:
//   WooCommerce variation.sku              ← Shopify variant.sku
//   WooCommerce variation.global_unique_id ← Shopify variant numeric ID
//   WooCommerce variation.stock_quantity   ← Shopify variant.inventoryQuantity
//   WooCommerce variation.meta_data._shopify_variation_id ← Shopify variant
//     numeric ID (legacy field, refreshed every run)
//   Shopify variant.metafield(custom.wordpress_variation_id) ← WooCommerce
//     variation ID
//
// PLUS — product-level fields synced every run:
//   Shopify product.metafield(custom.wordpress_id) ← WooCommerce product ID
//     (wpProductId) — always
//   Shopify product.status ← حسب خيار shopify_status (ACTIVE / DRAFT / KEEP)
//   Shopify product.title  ← "⭐ " prefix added once, idempotent — UNLESS add_star=false
//   WooCommerce product.status ← 'publish' — دايمًا، بدون خيار (اتضاف 26-08-2026)
//   WooCommerce product.meta_data._shopify_product_id ← Shopify product
//     numeric ID (legacy field, mirrors global_unique_id) — always
//   Shopify product.tags ← "stylebox" tag — آخر خطوة على الإطلاق، فورًا بدون
//     انتظار (كان فيه TAG_DELAY_MS 10 ثواني، اتلغى بالكامل 26-08-2026 — v2.4.0)
//
// ⚠️ تعديلات 26-08-2026 (v2.1.0) — الخيارات الثنائية اتحوّلت لأسئلة صريحة:
//   skip_draft (boolean) ← اتشال، بقى shopify_status: 'ACTIVE' | 'DRAFT' | 'KEEP'
//        ACTIVE → productUpdate يبعت status:'ACTIVE'
//        DRAFT  → productUpdate يبعت status:'DRAFT'   (الافتراضي — سلوك v2.0.0)
//        KEEP   → productUpdate ميبعتش status خالص    (الحالة تفضل زي ما هي)
//   skip_star (boolean) ← اتشال، بقى add_star: true | false
//        true  → "⭐ " تتضاف لبداية العنوان (الافتراضي — سلوك v2.0.0)
//        false → productUpdate ميبعتش title (العنوان يفضل زي ما هو)
//   الاتنين لسه مستقلّين تمامًا عن بعض — قيمة واحد مالهاش أي أثر على التاني.
//   الـ Tag "stylebox" + الـ metafield wordpress_id + WC status=publish +
//   مزامنة كل الـ SKU/المخزون بتشتغل عادي في كل الحالات بغض النظر عن قيمتهم.
//   (الـ Worker لسه بيقبل skip_draft/skip_star القديمين كـ fallback — راجع §HANDLER.)
//
// ⚠️ WooCommerce publish (26-08-2026): كل تشغيلة بتحوّل حالة منتج ووكومرس لـ
//   'publish' — خطوة تلقائية بدون خيار، بطلب صاحب الأداة. النتيجة بتتفحص من رد
//   الـ REST نفسه (status === 'publish') مش من HTTP 200 لوحده.
//
// ⚠️ GTIN fallback من الـ SKU (26-08-2026): لو global_unique_id (خانة GTIN)
//   فاضية على منتج ووكومرس، الـ Worker بيدوّر على رقم شوبيفاي في بداية SKU
//   (نمط "١٤ رقم-slug"، مثال "10468835819842-skechers-…") — لو لقاه، بيكتبه
//   في GTIN وبيشيله من الـ SKU (يفضل الباقي بس)، وبعدين يكمّل العملية عادي.
//   لو مفيش رقم في الـ SKU برضه، الفشل زي الأول تمامًا. راجع
//   extractGtinFromSku()/syncProduct() في §SYNC::matching.
//
// ⚠️ ترتيب الـ Tag (26-08-2026): tagsAdd بقى آخر عملية في syncProduct بالكامل —
//   بعد كل حاجة على شوبيفاي وووكومرس ومزامنة كل الـ Variations — فورًا بدون أي
//   انتظار. (كان فيه انتظار TAG_DELAY_MS 10 ثواني قبله لحد v2.3.0 — اتلغى
//   بالكامل بطلب صاحب الأداة نفس اليوم (26-08-2026)، v2.4.0. الترتيب [الـ Tag
//   آخر خطوة] نفسه لسه زي ما هو — الملغي هو الانتظار بس، مش الترتيب.)
//
// Matching key between platforms (variants): the size attribute/option
// value, matched on BOTH sides against ALLOWED_SIZE_ATTRIBUTE_NAMES below
// ("Shoe size" / "Size" / "size"). Exact match, case-sensitive, on the
// option/attribute VALUE itself.
//
// ⚠️ Manual-only by design (woocommerce-sync-helper skill — confirmed):
// NO Cron trigger, NO sync_all action. One HTTP call = one product.
// (كانت هنا `scheduled()` + `sync_all` قبل الرينيم — اتشالوا بالكامل 25-08-2026،
// النقيض صريح في السكيل: "Removed: sync_all action (do not reintroduce)".)
//
// ⚠️ Employee login ADDED 25-08-2026 (Universal D1 Auth) — كانت الأداة دي
// استثناء متعمّد وموثّق بدون تسجيل دخول ("أداة تشغيل يدوي" محمية بس بـ
// WORKER_SECRET). الاستثناء اتشال بطلب صاحب الأداة — الأداة دلوقتي زي أي أداة
// تانية في الستاك: كل عملية sync_product لازم موظف مسجّل دخول، ومسجّلة باسمه.
//
// ⚠️ فرق السعر (price_difference) — v2.3.0 (26-08-2026) كان أكشن منفصل
// (update_price)، اتدمج v2.5.0 (26-08-2026 برضه) جوه sync_product نفسها
// كخطوة اختيارية زي شوبيفاي status/⭐ بالظبط — مش أكشن قائم بذاته. لو
// price_difference مبعوتش، الخطوة دي بتتخطّى تمامًا (سلوك sync_product القديم
// زي ما هو). لو مبعوت: بيحدّث regular_price/sale_price لكل Variation في نفس
// نداء wcUpdateVariation بتاع SKU/المخزون (مش نداء إضافي) = سعر شوبيفاي + الفرق.
// نفس معادلة أداة "مزامنة أسعار Stylebox" حرفيًا (regular = compare_at+diff /
// sale = price+diff لو فيه خصم فعلي، وإلا regular = price+diff وsale فاضي) —
// راجع computeVariantPrices() تحت. المطابقة بمقاس الـ Variation
// (findWcSize/findShopifyVariantBySize) زي باقي sync_product، مش
// wordpress_variation_id/GTIN triple-check بتاع أداة الأسعار. D1: بيستخدم نفس
// type='synced'/'error' الأصليين لكل variation، مع extra.priceApplied=true
// كمُميِّز لو الخطوة دي اتنفذت.
//
// ⚠️ action=find_product (v2.4.0 — 26-08-2026): أكشن قراءة بس (GET، مفيش
// كتابة، مفيش D1 log — زي diag/get_config)، وبيمثّل الخطوة 1 في الواجهة:
// الموظف بيدخل رقم منتج شوبيفاي الرقمي (زي اللي في رابط
// admin.shopify.com/store/…/products/{ID})، والـ Worker بيدوّر على منتج
// ووكومرس اللي يطابقه — إما GTIN (global_unique_id) مساوي للرقم، أو الرقم في
// **بداية** الـ SKU (نفس ريجيكس extractGtinFromSku، لكن بالعكس: هنا بندوّر
// بالرقم على المنتج بدل ما نستخرج الرقم من منتج معروف). راجع
// findWcProductByShopifyId()/wcSearchProducts() في §FIND. لو لقى تطابق، بيرجّع
// wp_product_id + رابط جاهز لصفحة تعديل المنتج على ووردبريس (wpEditUrl) —
// الواجهة بتعرض زرار "عرض المنتج على وردبريس للمراجعة" بيه، وبعدين تفتح خطوة 2
// (خيارات الربط + تحديث السعر) بالـ wp_product_id ده جاهز، من غير ما الموظف
// يكتبه يدوي.
// ✅ فلتر global_unique_id على /wc/v3/products مؤكَّد شغّال فعليًا على
// stylebox.online (تجربة حقيقية 26-08-2026). ⚠️ محاولة تجميع إضافية v2.5.0:
// بحث بعنوان المنتج على شوبيفاي (search=) — العنوان بيُستخدم **لتضييق نطاق
// البحث بس**، والقبول النهائي القاطع لسه GTIN أو SKU زي فوق تمامًا، أبدًا مش
// بالعنوان (منتجين ممكن يتشابهوا في العنوان، أو يختلفوا جزئيًا بين المنصتين).
// البحث النصي القديم بالرقم نفسه (search=idStr) اتشال — تجربة حقيقية أثبتت
// إن ووكومرس هنا مش بيدوّر بيه على الـ SKU (رجّع صفر مرشّحين حتى لمنتج SKU
// بتاعه بيبدأ حرفيًا بالرقم المطلوب).
// ══════════════════════════════════════════════════════════════
const TOOL_NAME      = 'stylebox_products_linking'; // ecommoda-constants §7 — renamed from shopify_woo_sync 25-08-2026
const WORKER_VERSION = 'v2.7.0';

// الـ Tag اللي بيتضاف لكل منتج مربوط — آخر خطوة في syncProduct، فورًا بدون
// انتظار (كان فيه TAG_DELAY_MS 10 ثواني قبل الخطوة دي، اتلغى بالكامل 26-08-2026
// بطلب صاحب الأداة — v2.4.0. راجع §SYNC::syncProduct/§SYNC::addStyleboxTag).
const STYLEBOX_TAG  = 'stylebox';

// حالات المنتج المسموحة على شوبيفاي بعد الربط — KEEP معناها "ما تبعتش status
// خالص في productUpdate" مش قيمة بتتبعت لشوبيفاي.
const SHOPIFY_STATUS_CHOICES = ['ACTIVE', 'DRAFT', 'KEEP'];

// Size attribute/option names accepted on BOTH platforms — checked in
// order, first match wins. Used by findWcSize() (WooCommerce side) and
// findShopifyVariantBySize() (Shopify side). Add more names here if
// other products use yet another label — single source of truth.
const ALLOWED_SIZE_ATTRIBUTE_NAMES = ['Shoe size', 'Size', 'size'];

// ══════════════════════════════════════════════════════════════
// §CORS — Option B (write tool: مبدّل حالة/عنوان منتج + مخزون)
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://ecommoda-dev.github.io', // ⚠️ كان ecommoda24.github.io (حساب مهجور) — اتصلّح 25-08-2026
];
function getCORS(request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': '*' });
  return new Response(JSON.stringify(data), { status, headers });
}

function wcAuthHeader(env) {
  return 'Basic ' + btoa(`${env.WC_CONSUMER_KEY}:${env.WC_CONSUMER_SECRET}`);
}

// trailing-slash guard — نفس مبدأ .replace(/\/$/, '') المطبّق على الـ Worker URL
// في الواجهة، هنا على WC_BASE_URL عشان مايحصلش // مزدوج لو السر اتكتب بشرطة آخره
function wcBaseUrl(env) {
  return env.WC_BASE_URL.replace(/\/$/, '');
}

// always bust any upstream/host caching layer (Hostinger/LiteSpeed) —
// confirmed necessary in production, see notes from the Make.com build attempt
function bust(url) {
  return url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
}

// ─── §HELPERS::assertEnv ───
// متغير ناقص لازم يوقف العملية برسالة باسمه — بدل فشل صامت جوه الميوتيشن
// (LOCATION_ID الناقص في أدوات تانية بيتحوّل لـ ".../undefined" — نفس المبدأ هنا
// مع WC_BASE_URL/CLIENT_ID لو فضلوا فاضيين).
const ENV_REQUIRED = {
  shopify:     ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'],
  woocommerce: ['WC_BASE_URL', 'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET'],
};
function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (!env.DB) missing.push('DB (D1 binding)');
  if (!env.WORKER_SECRET) missing.push('WORKER_SECRET');
  if (missing.length) {
    throw new Error(
      `متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها من ` +
      `Dashboard → Settings → Variables ثم Promote النسخة. (شغّل ?action=diag)`
    );
  }
}

// ══════════════════════════════════════════════════════════════
// §SHARED — copy verbatim from references/shared-functions.md — never modify
// ══════════════════════════════════════════════════════════════
async function verifyEmployee(db, username, pin) {
  const row = await db.prepare(
    'SELECT display_name, is_active FROM employees WHERE username = ? AND pin = ?'
  ).bind(username, pin).first();

  if (!row) return null;

  if (!row.is_active) {
    throw new Error('الحساب موقوف — تواصل مع المسؤول');
  }

  db.prepare('UPDATE employees SET last_login = ? WHERE username = ?')
    .bind(new Date().toISOString(), username)
    .run()
    .catch(() => {});

  return row.display_name;
}

async function checkEmployee(db, username) {
  const row = await db.prepare(
    'SELECT is_active, pin FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row) return { exists: false, hasPin: false, isActive: false };
  return {
    exists:   true,
    hasPin:   !!row.pin,
    isActive: !!row.is_active,
  };
}

async function registerPin(db, username, pin) {
  const row = await db.prepare(
    'SELECT pin, is_active FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row)           throw new Error('اسم المستخدم غير موجود');
  if (!row.is_active) throw new Error('الحساب موقوف — تواصل مع المسؤول');
  if (row.pin)        throw new Error('هذا المستخدم مسجّل بالفعل — تواصل مع المسؤول لإعادة الضبط');

  await db.prepare('UPDATE employees SET pin = ? WHERE username = ?')
    .bind(pin, username)
    .run();

  return true;
}

async function writeLog(db, entry) {
  await db.prepare(`
    INSERT INTO logs
      (timestamp, tool, type, employee, order_id, order_name,
       sku, product_title, delta, value_before, value_after, notes, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.timestamp    ?? new Date().toISOString(),
    entry.tool,
    entry.type,
    entry.employee     ?? null,
    entry.orderId      ?? null,
    entry.orderName    ?? null,
    entry.sku          ?? null,
    entry.productTitle ?? null,
    entry.delta        ?? null,
    entry.valueBefore  ?? null,
    entry.valueAfter   ?? null,
    entry.notes        ?? null,
    entry.extra ? JSON.stringify(entry.extra) : null
  ).run();
}

async function getLogs(db, {
  tool = null, employee = null, type = null, search = null, limit = 100, offset = 0,
} = {}) {
  let sql = "SELECT * FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];
  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (type)     { sql += ' AND type = ?';     b.push(type); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  b.push(Math.min(limit, 100), offset);
  return (await db.prepare(sql).bind(...b).all()).results;
}

async function getLogsCount(db, { tool = null, employee = null, search = null } = {}) {
  let sql = "SELECT COUNT(*) as total FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];
  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

async function getLogsExport(db, { tool = null, employee = null, search = null } = {}) {
  let sql = "SELECT * FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];
  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY timestamp DESC LIMIT 2000';
  return (await db.prepare(sql).bind(...b).all()).results;
}

// ─── §SHARED::safeWriteLog — Step 5A ⑦ ───
// فشل D1 لازم يبان كـ logged:false، مش يسقط الرد كله على 500 لعملية شوبيفاي/WC
// حصلت فعلاً. نفس نمط verify_employee/log_logout بالظبط، لكن كـ helper عام
// لاستخدامه في §SYNC اللي بيكتب أكتر من صف لوج لكل تشغيلة.
async function safeWriteLog(db, entry) {
  try {
    await writeLog(db, entry);
    return true;
  } catch (e) {
    console.error('writeLog failed:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════
async function getAccessToken(env) {
  const resp = await fetch(
    `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        grant_type:    'client_credentials',
      }),
    }
  );
  if (!resp.ok) throw new Error(`OAuth failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

// ─── §SHOPIFY::shopifyGQL — العقد الإلزامي (Step 5A ①) ───
// أي فشل بيترمي. مفيش رد بيعدّي وهو فاشل:
//   ① فشل شبكة  ② HTTP status  ③ رد مش JSON  ④ data.errors  ⑤ data فاضية
// + retry على THROTTLED و5xx/429. النسخة القديمة كانت `return resp.json()` بلا
// أي فحص — عطل موثّق في anti-patterns.md ("Silent Success" — كلّف EcomModa
// ٤ أيام استرجاع مخزون وهمي في أداة تانية). اتصلّحت هنا 25-08-2026.
async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify') {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/2026-01/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// title مطلوب — الـ idempotency check الخاص بالـ "⭐ " prefix
// price/compareAtPrice — بيتستخدموا في خطوة تحديث السعر الاختيارية جوه
// syncProduct (لو price_difference اتبعت)، وبيتجاهلوا زي أي field تاني لو لأ
const VARIANTS_QUERY = `
  query getVariants($id: ID!) {
    product(id: $id) {
      title
      vendor
      variants(first: 100) {
        edges {
          node {
            id
            sku
            price
            compareAtPrice
            inventoryQuantity
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

// ─── §SHOPIFY::PRODUCT_WPID_CHECK_QUERY — v2.7.0 (حارس "اتربط قبل كده") ───
// خطوة 1 في الواجهة بتنادي بيها قبل أي بحث في ووكومرس: لو المنتج ده أصلاً
// عنده قيمة في custom.wordpress_id، يبقى اتربط قبل كده. راجع
// checkShopifyAlreadyLinked() في §FIND.
const PRODUCT_WPID_CHECK_QUERY = `
  query checkAlreadyLinked($id: ID!) {
    product(id: $id) {
      title
      metafield(namespace: "custom", key: "wordpress_id") { value }
    }
  }
`;

const SET_VARIATION_ID_MUTATION = `
  mutation setVariationId($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id value }
      userErrors { field message }
    }
  }
`;

const SET_PRODUCT_METAFIELD_MUTATION = `
  mutation setProductMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id value }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation updateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id status title }
      userErrors { field message }
    }
  }
`;

const TAGS_ADD_MUTATION = `
  mutation addTags($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

// ══════════════════════════════════════════════════════════════
// §WOOCOMMERCE — REST helpers
// ══════════════════════════════════════════════════════════════
async function wcGetProduct(env, wpProductId) {
  const resp = await fetch(
    bust(`${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}`),
    { headers: { Authorization: wcAuthHeader(env) } }
  );
  if (!resp.ok) throw new Error(`WC get product ${wpProductId} failed: ${resp.status}`);
  return resp.json();
}

// ─── §WOOCOMMERCE::wcSearchProducts — v2.4.0، خطوة 1 (find_product) ───
// wrapper عام حوالين GET /wc/v3/products بأي query params (search / sku /
// global_unique_id / per_page...). بيرمي زي أي نداء WC تاني في الملف — مفيش
// فحص خاص هنا، الفحص الفعلي (هل النتيجة بتطابق فعلًا) بيحصل في
// findWcProductByShopifyId() اللي بتستخدمها.
async function wcSearchProducts(env, params) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(
    bust(`${wcBaseUrl(env)}/wp-json/wc/v3/products?${qs}`),
    { headers: { Authorization: wcAuthHeader(env) } }
  );
  if (!resp.ok) throw new Error(`WC search products failed: ${resp.status}`);
  return resp.json();
}

// ─── §WOOCOMMERCE::wcSearchBrands — v2.6.0 (البراند إلزامي قبل الربط) ───
// تاكسونومي `product_brand` الأصلي في ووكومرس (نفس اللي شاشة تحرير المنتج
// بتاعه فيها "All Brands" checkboxes + "+ Add New Brand" — راجع
// edit-tags.php?taxonomy=product_brand&post_type=product). الـ REST endpoint
// بيتبع نفس شكل categories/tags تمامًا: GET بيرجّع array من {id, name, slug}،
// والـ PUT على المنتج بياخد `brands: [{id}]`.
// ⚠️ لسه مش متأكَّد فعليًا (زي فلتر global_unique_id في §FIND) إن الـ endpoint
// ده شغّال على stylebox.online — راجع "مسائل مفتوحة" في CLAUDE.md.
async function wcSearchBrands(env, params) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(
    bust(`${wcBaseUrl(env)}/wp-json/wc/v3/products/brands?${qs}`),
    { headers: { Authorization: wcAuthHeader(env) } }
  );
  if (!resp.ok) throw new Error(`WC search brands failed: ${resp.status}`);
  return resp.json();
}

// مطابقة حرفية (case-insensitive، بعد trim) — مش بحث تقريبي. الاسم لازم يطابق
// اسم الـ Vendor على شوبيفاي بالظبط، وإلا العملية بتُعتبر "مفيش براند" (تتوقف).
async function wcFindBrandByName(env, vendorName) {
  const target  = vendorName.trim().toLowerCase();
  const results = await wcSearchBrands(env, { search: vendorName, per_page: 100 });
  if (!Array.isArray(results)) return null;
  return results.find(b => String(b?.name || '').trim().toLowerCase() === target) || null;
}

// ─── §HELPERS::slugify — تعديل إلزامي جديد (v2.6.0): الـ Slug لازم يطابق العنوان ───
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// product-level update — used to refresh the legacy "_shopify_product_id"
// meta field (status=publish call), and also (26-08-2026) to recover a
// missing global_unique_id (GTIN) + strip the number back out of sku —
// see extractGtinFromSku()/syncProduct(). meta_data passed here upserts by
// key — does NOT wipe other existing meta, same behavior relied on in
// wcUpdateVariation() below.
async function wcUpdateProduct(env, wpProductId, payload) {
  const resp = await fetch(
    `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}`,
    {
      method:  'PUT',
      headers: { Authorization: wcAuthHeader(env), 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`WC update product ${wpProductId} failed: ${resp.status} ${errText}`);
  }
  return resp.json();
}

async function wcGetVariations(env, wpProductId) {
  const resp = await fetch(
    bust(`${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}/variations?per_page=100`),
    { headers: { Authorization: wcAuthHeader(env) } }
  );
  if (!resp.ok) throw new Error(`WC get variations for ${wpProductId} failed: ${resp.status}`);
  return resp.json();
}

async function wcUpdateVariation(env, wpProductId, variationId, payload) {
  const resp = await fetch(
    `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}/variations/${variationId}`,
    {
      method:  'PUT',
      headers: { Authorization: wcAuthHeader(env), 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`WC update variation ${variationId} failed: ${resp.status} ${errText}`);
  }
  return resp.json();
}

// ══════════════════════════════════════════════════════════════
// §SYNC::matching — pure logic, no network calls
// ══════════════════════════════════════════════════════════════
function findWcSize(variation) {
  const attr = (variation.attributes || []).find(a =>
    ALLOWED_SIZE_ATTRIBUTE_NAMES.includes(a.name)
  );
  return attr ? attr.option : null;
}

function findShopifyVariantBySize(shopifyVariants, size) {
  return shopifyVariants.find(v =>
    (v.selectedOptions || []).some(opt =>
      ALLOWED_SIZE_ATTRIBUTE_NAMES.includes(opt.name) && opt.value === size
    )
  );
}

function numericIdFromGid(gid) {
  return gid.split('/').pop();
}

// ─── §SYNC::matching::money ─── (v2.3.0 — نفس helper وأداة "مزامنة أسعار
// Stylebox" حرفيًا: تقريب لأقرب قرشين + تنسيق ثابت "0.00")
function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// ─── §PRICE::computeVariantPrices ─── نفس معادلة processVariant() في
// stylebox-price-sync-worker حرفيًا — فيه خصم فعلي على شوبيفاي (compare_at >
// price) → regular = compare_at+diff / sale = price+diff. مفيش خصم → regular
// = price+diff وsale فاضي (بيمسح أي sale_price قديم على ووكومرس).
function computeVariantPrices(shopifyPrice, shopifyCompareAt, diff) {
  const hasCompare = Number.isFinite(shopifyCompareAt) && shopifyCompareAt > shopifyPrice;
  if (hasCompare) {
    return { regularPrice: money(shopifyCompareAt + diff), salePrice: money(shopifyPrice + diff) };
  }
  return { regularPrice: money(shopifyPrice + diff), salePrice: '' };
}

// ══════════════════════════════════════════════════════════════
// §SYNC::gtinFromSku — fallback لما global_unique_id (GTIN) يكون فاضي
// بعض منتجات ووكومرس اتكتب فيها رقم شوبيفاي في بداية الـ SKU بدل ما يتحط
// في خانة GTIN (مثال: "10468835819842-skechers-slip-ins-relaxed-fit-…").
// الدالة دي بتاخد الرقم بس (قبل أول "-")، وبترجّع الباقي كـ SKU جديد.
// حد أدنى 6 أرقام عشان مايتلخبطش مع SKU عادي مالوش رقم شوبيفاي فعلي فيه.
// ══════════════════════════════════════════════════════════════
function extractGtinFromSku(sku) {
  if (typeof sku !== 'string') return null;
  const match = sku.match(/^(\d{6,})-(.+)$/);
  if (!match) return null;
  return { gtin: match[1], sku: match[2] };
}

// ─── §FIND::checkShopifyAlreadyLinked — v2.7.0 ───
// أول حاجة بتتنفّذ في find_product، قبل أي بحث في ووكومرس: لو منتج شوبيفاي
// ده أصلاً عنده قيمة في metafield custom.wordpress_id، يبقى اتربط قبل كده —
// بنوقف هنا ونرجّع alreadyLinked بدل ما نكمل بحث WC عادي زي أي منتج جديد.
// راجع PRODUCT_WPID_CHECK_QUERY و§HANDLER.
async function checkShopifyAlreadyLinked(env, shopifyProductId) {
  assertEnv(env, 'shopify');
  const token = await getAccessToken(env);
  const resp = await shopifyGQL(
    env, token, PRODUCT_WPID_CHECK_QUERY,
    { id: `gid://shopify/Product/${shopifyProductId}` },
    'find_product:checkAlreadyLinked'
  );
  const product = resp?.data?.product;
  const wpId = product?.metafield?.value || null;
  return {
    linked:       !!wpId,
    wordpressId:  wpId,
    productTitle: product?.title || null,
  };
}

// ══════════════════════════════════════════════════════════════
// §FIND::findWcProductByShopifyId — v2.4.0 (بحث بالعنوان اتضاف v2.5.0)
// الموظف بيدخل رقم منتج شوبيفاي، والدالة دي بتدوّر على منتج ووكومرس اللي
// GTIN بتاعه (global_unique_id) بيساوي الرقم، أو الرقم في بداية الـ SKU —
// نفس ريجيكس extractGtinFromSku فوق، لكن بالعكس (هنا الرقم معروف من الأول،
// وبندوّر بيه على المنتج بدل ما نستخرجه من SKU منتج معروف).
//
// محاولتان لتجميع المرشحين، لكن **القبول النهائي بيعتمد على GTIN/SKU بس**:
//   1. فلتر global_unique_id مباشر على /wc/v3/products — رسمي في ووكومرس
//      9.2+، بيرجّع تطابق دقيق فورًا. ✅ مؤكَّد شغّال على stylebox.online
//      (تجربة حقيقية 26-08-2026 — راجع CLAUDE.md).
//   2. بحث بعنوان المنتج على شوبيفاي (search=) — ⚠️ العنوان هنا **لتضييق
//      نطاق البحث بس، مش تأكيد نهائي**: ممكن يكون فيه منتجين بنفس العنوان،
//      أو العنوان يختلف جزئيًا بين المنصتين. البديل عن محاولة 2 القديمة
//      (search= بالرقم نفسه) اللي اتأكد فعليًا (26-08-2026) إن ووكومرس هنا
//      مش بيدوّر بيها على الـ SKU — رجّعت صفر مرشّحين حتى لمنتج SKU بتاعه
//      بيبدأ حرفيًا بالرقم المطلوب.
// القبول النهائي القاطع من بين كل المرشّحين (من المحاولتين): GTIN == الرقم
// حرفيًا، أو SKU يبدأ بالرقم ده تحديدًا — العنوان **مايُستخدمش أبدًا** كتأكيد.
// ══════════════════════════════════════════════════════════════
async function findWcProductByShopifyId(env, shopifyProductId) {
  assertEnv(env, 'shopify', 'woocommerce');
  const idStr = String(shopifyProductId);

  const candidates = [];

  try {
    const byGtin = await wcSearchProducts(env, { global_unique_id: idStr, per_page: 10 });
    if (Array.isArray(byGtin)) candidates.push(...byGtin);
  } catch (e) {
    console.error('wcSearchProducts(global_unique_id) failed — falling back to title search:', e);
  }

  // ─── §FIND::narrowByShopifyTitle — تضييق النطاق بس، مش تأكيد ───
  try {
    const token = await getAccessToken(env);
    const titleResp = await shopifyGQL(
      env, token,
      `query getTitle($id: ID!) { product(id: $id) { title } }`,
      { id: `gid://shopify/Product/${idStr}` },
      'find_product:getTitle'
    );
    const shopifyTitle = titleResp?.data?.product?.title || null;
    if (shopifyTitle) {
      const byTitle = await wcSearchProducts(env, { search: shopifyTitle, per_page: 25 });
      if (Array.isArray(byTitle)) candidates.push(...byTitle);
    }
  } catch (e) {
    // فشل هنا (توكن/رقم شوبيفاي غلط/مفيش نتيجة) مايمنعش محاولة GTIN فوق
    // من نجاحها لوحدها — تجميع مرشحين إضافيين بس، مش شرط أساسي
    console.error('find_product: narrowing by Shopify title failed:', e);
  }

  const seen = new Set();
  const unique = candidates.filter(p => {
    if (!p || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // ── التأكيد النهائي القاطع — GTIN أو SKU بس، أبدًا مش بالعنوان ──
  const match = unique.find(p => {
    if (String(p.global_unique_id || '').trim() === idStr) return true;
    const skuMatch = String(p.sku || '').match(/^(\d{6,})-/);
    return !!(skuMatch && skuMatch[1] === idStr);
  });

  if (!match) {
    return { found: false, scanned: unique.length };
  }

  return {
    found: true,
    wp_product_id: match.id,
    productName: match.name,
    sku: match.sku,
    matchedBy: String(match.global_unique_id || '').trim() === idStr ? 'gtin' : 'sku',
    wpEditUrl: `${wcBaseUrl(env)}/wp-admin/post.php?post=${match.id}&action=edit`,
  };
}

// ─── §SYNC::BrandNotFoundError — v2.6.0 ───
// حارس إلزامي جديد قبل أي كتابة في syncProduct: لازم يكون فيه براند على
// ووردبريس (تاكسونومي product_brand) بنفس اسم الـ Vendor على شوبيفاي. لو
// مفيش، الربط بالكامل بيتوقف من غير أي كتابة (زي فشل no global_unique_id) —
// الفرق إنه بيترجع بشكل مُبنيَن (code/vendor/addBrandUrl) عشان الواجهة تعرض
// نافذة خطأ فيها زرار "إضافة البراند على StyleBox" بدل رسالة عادية. راجع
// §HANDLER catch block.
class BrandNotFoundError extends Error {
  constructor(vendor, addBrandUrl) {
    super(`لا يوجد براند بنفس اسم "${vendor}" على ووردبريس — الربط تم إيقافه`);
    this.code        = 'brand_missing';
    this.vendor      = vendor;
    this.addBrandUrl = addBrandUrl;
  }
}

// ══════════════════════════════════════════════════════════════
// §SYNC::productLevelSync
// Runs once per linked product, every sync_product call. Independent of
// the per-variation loop below — wrapped in its own try/catch in
// syncProduct() so a failure here never blocks the variation/stock sync.
// ══════════════════════════════════════════════════════════════
async function syncProductLevelFields(env, token, shopifyProductGid, wpProductId, currentTitle, opts) {
  const { shopifyStatus, addStar } = opts;

  // ── 1. Title candidate: prepend "⭐ " — idempotent, never double-prefixes ──
  const alreadyStarred = typeof currentTitle === 'string' && currentTitle.startsWith('⭐');
  const newTitle        = alreadyStarred ? currentTitle : `⭐ ${currentTitle}`;

  // ── 2. productUpdate — input بيتبني حسب shopify_status/add_star، مستقلّين ──
  //   shopifyStatus === 'KEEP' → مافيش status في الـ input خالص
  //   addStar       === false  → مافيش title في الـ input خالص
  //   لو الاتنين متعطّلين → الميوتيشن نفسها مبتتنفّذش (مافيش حاجة تتغيّر)
  const wantsStatus = shopifyStatus !== 'KEEP';
  const productInput = { id: shopifyProductGid };
  if (wantsStatus) productInput.status = shopifyStatus;
  if (addStar)     productInput.title  = newTitle;

  let statusApplied = false, titleApplied = false;

  if (wantsStatus || addStar) {
    const productUpdateResp   = await shopifyGQL(env, token, PRODUCT_UPDATE_MUTATION, { input: productInput }, 'productUpdate');
    const productUpdateResult = productUpdateResp?.data?.productUpdate;
    const productUpdateErrors = productUpdateResult?.userErrors || [];
    if (productUpdateErrors.length) {
      throw new Error('productUpdate failed: ' + productUpdateErrors.map(e => e.message).join(' | '));
    }
    const returnedProduct = productUpdateResult?.product || null;
    if (!returnedProduct) {
      // Step 5A ②③ — userErrors فاضية مش كافية، لازم تأكيد الـ payload نفسه
      throw new Error('productUpdate: شوبيفاي ما رجّعتش المنتج المحدَّث — العملية غير مؤكَّدة');
    }
    if (wantsStatus) {
      statusApplied = returnedProduct.status === shopifyStatus;
      if (!statusApplied) throw new Error(`productUpdate: الحالة الراجعة "${returnedProduct.status}" مش ${shopifyStatus} — العملية غير مؤكَّدة`);
    }
    if (addStar) {
      titleApplied = returnedProduct.title === newTitle;
      if (!titleApplied) throw new Error('productUpdate: العنوان الراجع مختلف عن المتوقع — العملية غير مؤكَّدة');
    }
  }

  // ⚠️ tagsAdd كان هنا (الخطوة 3) لحد v2.0.0 — اتنقل بالكامل لآخر syncProduct
  // (راجع §SYNC::addStyleboxTag و§CONSTANTS).

  // ── 3. metafieldsSet: custom.wordpress_id (product-level, Integer) — دايمًا ──
  const metafieldResp = await shopifyGQL(env, token, SET_PRODUCT_METAFIELD_MUTATION, {
    metafields: [{
      ownerId:   shopifyProductGid,
      namespace: 'custom',
      key:       'wordpress_id',
      type:      'number_integer',
      value:     String(wpProductId),
    }],
  }, 'metafieldsSet(wordpress_id)');
  const metafieldResult = metafieldResp?.data?.metafieldsSet;
  const metafieldErrors = metafieldResult?.userErrors || [];
  if (metafieldErrors.length) throw new Error('metafieldsSet (wordpress_id) failed: ' + metafieldErrors.map(e => e.message).join(' | '));
  if (!metafieldResult?.metafields?.length) throw new Error('metafieldsSet (wordpress_id): شوبيفاي ما رجّعتش الميتافيلد المكتوب — العملية غير مؤكَّدة');

  return {
    shopifyStatus,                                   // 'ACTIVE' | 'DRAFT' | 'KEEP'
    keptStatus:   shopifyStatus === 'KEEP',
    addStar,
    statusApplied,
    titleApplied,
    newTitle:     addStar ? newTitle : currentTitle,
    status:       shopifyStatus !== 'KEEP' ? shopifyStatus : null,
    wordpress_id: wpProductId,
  };
}

// ══════════════════════════════════════════════════════════════
// §SYNC::addStyleboxTag — آخر خطوة على الإطلاق في كل تشغيلة
// بتتنادى من syncProduct بعد ما كل حاجة تانية تخلص، فورًا بدون أي انتظار
// (كان فيه TAG_DELAY_MS قبلها لحد v2.3.0 — اتلغى بالكامل v2.4.0).
// tagsAdd بتدعدَب أوتوماتيك من شوبيفاي — آمنة التكرار تمامًا.
// ══════════════════════════════════════════════════════════════
async function addStyleboxTag(env, token, shopifyProductGid) {
  const tagsAddResp   = await shopifyGQL(env, token, TAGS_ADD_MUTATION, { id: shopifyProductGid, tags: [STYLEBOX_TAG] }, 'tagsAdd');
  const tagsAddResult = tagsAddResp?.data?.tagsAdd;
  const tagsAddErrors = tagsAddResult?.userErrors || [];
  if (tagsAddErrors.length) throw new Error('tagsAdd failed: ' + tagsAddErrors.map(e => e.message).join(' | '));
  if (!tagsAddResult?.node) throw new Error('tagsAdd: شوبيفاي ما أكدتش العملية — مفيش node راجع');
  return STYLEBOX_TAG;
}

// ══════════════════════════════════════════════════════════════
// §SYNC::syncProduct — the core operation, called from action=sync_product
// ⚠️ manual-only by design — لا يوجد sync_all ولا Cron (راجع §CONSTANTS فوق)
//
// ترتيب التنفيذ (مهم — اتغيّر 27-08-2026، v2.6.0):
//   1. قراءة منتج ووكومرس + الـ Variations + منتج شوبيفاي
//   1.5. ⚠️ حارس إلزامي جديد (v2.6.0) — لازم يكون فيه براند على ووردبريس بنفس
//        اسم الـ Vendor، وإلا الربط بالكامل يتوقف هنا من غير أي كتابة
//        (BrandNotFoundError). لو موجود، الـ id بتاعه يتحفظ لحد الخطوة 3.
//   2. Shopify product-level: status (حسب الخيار) + ⭐ (حسب الخيار) + wordpress_id
//   3. WooCommerce product-level: status='publish' + meta _shopify_product_id
//      + slug fix (v2.6.0، إلزامي بدون خيار) + ربط الـ Brand (v2.6.0، لو 1.5 لقى تطابق)
//   4. لكل Variation: SKU/مخزون/meta على ووكومرس + wordpress_variation_id على شوبيفاي
//   5. tagsAdd("stylebox") فورًا ← آخر خطوة، بعد كل اللي فوق (كان فيه انتظار
//      TAG_DELAY_MS 10 ثواني قبلها لحد v2.3.0 — اتلغى بالكامل v2.4.0)
// ══════════════════════════════════════════════════════════════
async function syncProduct(env, wpProductId, opts = {}) {
  const { shopifyStatus = 'DRAFT', addStar = true, employee = null, priceDifference = null } = opts;
  if (!SHOPIFY_STATUS_CHOICES.includes(shopifyStatus)) {
    throw new Error(`shopify_status غير صالحة: "${shopifyStatus}" — المسموح: ${SHOPIFY_STATUS_CHOICES.join(' / ')}`);
  }
  assertEnv(env, 'shopify', 'woocommerce');

  let loggedOk = true;

  const wooProduct = await wcGetProduct(env, wpProductId);
  let shopifyProductId    = wooProduct.global_unique_id;
  let gtinRecoveredFromSku = null;

  // ── Fallback (26-08-2026، بطلب صاحب الأداة): global_unique_id (GTIN) فاضي
  // بس رقم شوبيفاي متكتب في بداية الـ SKU — بنستخرجه، بنكتبه في GTIN، وبننضّف
  // الـ SKU من الرقم. لو مفيش رقم في الـ SKU برضه، الفشل زي ما كان بالظبط.
  if (!shopifyProductId) {
    const extracted = extractGtinFromSku(wooProduct.sku);
    if (extracted) {
      try {
        const wcUpdated = await wcUpdateProduct(env, wpProductId, {
          sku:              extracted.sku,
          global_unique_id: extracted.gtin,
        });
        shopifyProductId       = wcUpdated?.global_unique_id || extracted.gtin;
        gtinRecoveredFromSku    = { skuBefore: wooProduct.sku, skuAfter: extracted.sku, gtin: extracted.gtin };
        wooProduct.sku              = extracted.sku;
        wooProduct.global_unique_id = shopifyProductId;
        const okLog = await safeWriteLog(env.DB, {
          tool: TOOL_NAME, type: 'product_meta_synced', employee,
          productTitle: wooProduct.name,
          notes: `global_unique_id (GTIN) كان فاضي — الرقم ${extracted.gtin} اتستخرج من بداية SKU وكُتب في GTIN، والـ SKU بقى "${extracted.sku}"`,
          extra: { wpProductId, ...gtinRecoveredFromSku },
        });
        if (!okLog) loggedOk = false;
      } catch (e) {
        throw new Error(`Product ${wpProductId}: no global_unique_id (Shopify Product ID) set، ولقينا رقم ${extracted.gtin} في الـ SKU بس كتابته على ووكومرس فشلت: ${e.message}`);
      }
    }
  }

  if (!shopifyProductId) {
    throw new Error(`Product ${wpProductId}: no global_unique_id (Shopify Product ID) set, ومفيش رقم شوبيفاي في بداية الـ SKU (${wooProduct.sku || '—'}) — skipping`);
  }
  const shopifyProductGid = `gid://shopify/Product/${shopifyProductId}`;

  const wooVariations = await wcGetVariations(env, wpProductId);

  const token   = await getAccessToken(env);
  const gqlResp = await shopifyGQL(env, token, VARIANTS_QUERY, { id: shopifyProductGid }, 'getVariants');
  if (!gqlResp?.data?.product) {
    throw new Error(`Product ${wpProductId}: المنتج ${shopifyProductGid} مش موجود على شوبيفاي أو التوكن مالوش صلاحية عليه`);
  }
  const shopifyVariants = (gqlResp.data.product.variants?.edges || []).map(e => e.node);
  const shopifyTitle    = gqlResp.data.product.title || '';
  const shopifyVendor   = String(gqlResp.data.product.vendor || '').trim();

  // ── حارس إلزامي جديد (v2.6.0) — قبل أي كتابة: لازم يكون فيه براند على
  // ووردبريس بنفس اسم الـ Vendor على شوبيفاي. Vendor فاضي = تخطّي الحارس
  // (مفيش حاجة تتطابق أصلاً)، مش اعتبارها "براند موجود". راجع BrandNotFoundError.
  let wcBrandId = null;
  if (shopifyVendor) {
    let brandMatch;
    try {
      brandMatch = await wcFindBrandByName(env, shopifyVendor);
    } catch (e) {
      throw new Error(`تعذّر التحقق من براند "${shopifyVendor}" على ووردبريس: ${e.message}`);
    }
    if (!brandMatch) {
      await safeWriteLog(env.DB, {
        tool: TOOL_NAME, type: 'error', employee,
        productTitle: wooProduct.name,
        notes: `الربط أُوقف — لا يوجد براند "${shopifyVendor}" (Vendor على شوبيفاي) على ووردبريس`,
        extra: { wpProductId, shopifyProductId, vendor: shopifyVendor },
      });
      throw new BrandNotFoundError(
        shopifyVendor,
        `${wcBaseUrl(env)}/wp-admin/edit-tags.php?taxonomy=product_brand&post_type=product`
      );
    }
    wcBrandId = brandMatch.id;
  }

  // ── Shopify-side product-level fields (metafield + Draft + tag + ⭐ title) ──
  // Isolated try/catch: a failure here is logged but never blocks the
  // variation/stock sync below from running for this product.
  let productLevelResult = null;
  let productLevelError  = null;
  try {
    productLevelResult = await syncProductLevelFields(
      env, token, shopifyProductGid, wpProductId, shopifyTitle, { shopifyStatus, addStar }
    );
    const okLog = await safeWriteLog(env.DB, {
      tool:         TOOL_NAME,
      type:         'product_meta_synced',
      employee,
      productTitle: productLevelResult.newTitle,
      notes:        `wordpress_id=${wpProductId} set` +
                    (shopifyStatus === 'KEEP' ? '، حالة شوبيفاي اتسابت زي ما هي' : `، status→${shopifyStatus}`) +
                    (addStar ? (productLevelResult.titleApplied ? '، ⭐ اتضافت للعنوان' : '، العنوان كان متعلّم من قبل') : '، إضافة ⭐ اتخطّت'),
      extra: { wpProductId, shopifyProductId, ...productLevelResult },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    productLevelError = e.message;
    console.error(`Product-level sync failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `Product-level sync (metafield/status/title) failed: ${e.message}`,
      extra: { wpProductId, shopifyProductId },
    });
    if (!okLog) loggedOk = false;
  }

  // ── WooCommerce-side product-level: status=publish + meta _shopify_product_id
  //    + slug fix (v2.6.0، إلزامي بدون خيار) + ربط الـ Brand المطابق للـ Vendor
  //    (v2.6.0، لو الحارس فوق لقى تطابق) ──
  // status='publish' اتضاف 26-08-2026 — خطوة تلقائية بدون خيار: كل منتج بيتربط
  // بيتنشر على stylebox.online. (_shopify_product_id حقل قديم legacy بيعكس
  // global_unique_id.) كل التعديلات دي في نداء PUT واحد — نفس الطلب، نفس الفحص.
  // معزول عن بلوك شوبيفاي فوق: منصّة مختلفة وأنماط فشل مختلفة، وفشل واحد
  // مالوش حق يخفي أو يوقف التاني.
  const expectedSlug = slugify(wooProduct.name);
  const slugNeedsFix  = !!expectedSlug && wooProduct.slug !== expectedSlug;
  let slugFixed          = null;
  let wcProductMetaError = null;
  let wcPublished        = false;
  try {
    const updatePayload = {
      status:    'publish',
      meta_data: [{ key: '_shopify_product_id', value: shopifyProductId }],
    };
    if (slugNeedsFix) updatePayload.slug = expectedSlug;
    if (wcBrandId)    updatePayload.brands = [{ id: wcBrandId }];

    const wcUpdated = await wcUpdateProduct(env, wpProductId, updatePayload);
    // ⚠️ HTTP 200 لوحده مش إثبات — ووكومرس بترجّع المنتج بحالته الفعلية بعد
    // التحديث، فالتأكيد بيتقرا منها هي (نفس مبدأ فحص returnedProduct.status).
    wcPublished = wcUpdated?.status === 'publish';
    if (!wcPublished) {
      throw new Error(`WC status الراجعة "${wcUpdated?.status ?? '—'}" مش publish — العملية غير مؤكَّدة`);
    }
    if (slugNeedsFix) {
      slugFixed = { before: wooProduct.slug, after: expectedSlug, confirmed: wcUpdated?.slug === expectedSlug };
    }
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'product_meta_synced', employee,
      notes: `WC status→publish، meta _shopify_product_id refreshed = ${shopifyProductId}` +
             (slugFixed ? `، slug اتصلّح من "${slugFixed.before}" لـ "${slugFixed.after}"` : '') +
             (wcBrandId ? `، Brand "${shopifyVendor}" اتربط بالمنتج` : ''),
      extra: { wpProductId, shopifyProductId, wcStatus: 'publish', slugFixed, brandLinked: wcBrandId ? { id: wcBrandId, name: shopifyVendor } : null },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    wcProductMetaError = e.message;
    console.error(`WC product-level update (publish/meta) failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `WC product-level update (status=publish + _shopify_product_id) failed: ${e.message}`,
      extra: { wpProductId, shopifyProductId },
    });
    if (!okLog) loggedOk = false;
  }

  const results = [];

  for (const variation of wooVariations) {
    const wcSize = findWcSize(variation);

    if (!wcSize) {
      results.push({ variationId: variation.id, status: 'skipped', reason: 'no matching size attribute' });
      continue;
    }

    const match = findShopifyVariantBySize(shopifyVariants, wcSize);

    if (!match) {
      results.push({ variationId: variation.id, size: wcSize, status: 'skipped', reason: 'no matching Shopify variant' });
      const okLog = await safeWriteLog(env.DB, {
        tool: TOOL_NAME, type: 'error', employee,
        sku: variation.sku,
        notes: `No Shopify variant found for size ${wcSize}`,
        extra: { wpProductId, variationId: variation.id },
      });
      if (!okLog) loggedOk = false;
      continue;
    }

    const shopifyVariantNumericId = numericIdFromGid(match.id);
    const stockBefore = variation.stock_quantity;

    // ── حساب السعر (اختياري — priceDifference != null) — v2.5.0، اندمجت هنا
    // بدل ما تكون أكشن منفصل، بالظبط زي سؤال الحالة/النجمة فوق: خطوة إضافية
    // جوه نفس sync_product، مش استدعاء تاني. راجع computeVariantPrices().
    let priceInfo = null;
    let priceWarning = null;
    if (priceDifference !== null) {
      const shopifyPrice = parseFloat(match.price);
      if (!Number.isFinite(shopifyPrice)) {
        priceWarning = `سعر شوبيفاي غير صالح: "${match.price}"`;
      } else {
        const compareRaw     = match.compareAtPrice;
        const shopifyCompare = (compareRaw !== null && compareRaw !== undefined && compareRaw !== '') ? parseFloat(compareRaw) : null;
        priceInfo = computeVariantPrices(shopifyPrice, shopifyCompare, priceDifference);
      }
    }

    // ── 1. Update WooCommerce variation: SKU + Stock + legacy meta field + (السعر لو مطلوب) ──
    const variationPayload = {
      sku:               match.sku,
      stock_quantity:    match.inventoryQuantity,
      manage_stock:      true,
      global_unique_id:  shopifyVariantNumericId,
      meta_data: [
        { key: '_shopify_variation_id', value: shopifyVariantNumericId },
      ],
    };
    if (priceInfo) {
      variationPayload.regular_price = priceInfo.regularPrice;
      variationPayload.sale_price    = priceInfo.salePrice;
    }
    const wcVariationUpdated = await wcUpdateVariation(env, wpProductId, variation.id, variationPayload);

    // ⚠️ Step 5A-style تأكيد للسعر — HTTP 200 لوحده مش إثبات، لازم نقرا الرد
    // الفعلي. فشل التأكيد هنا بيبقى تحذير على مستوى الـ variation، مش استثناء
    // بيلغي التحديثات التانية (SKU/المخزون فوق أصلًا اتنفذوا في نفس النداء).
    if (priceInfo) {
      const regularConfirmed = String(wcVariationUpdated?.regular_price ?? '') === priceInfo.regularPrice;
      const saleConfirmed    = String(wcVariationUpdated?.sale_price ?? '') === (priceInfo.salePrice || '');
      if (!regularConfirmed || !saleConfirmed) {
        priceWarning = `ووكومرس رجّعت regular_price="${wcVariationUpdated?.regular_price}" / sale_price="${wcVariationUpdated?.sale_price}" — مش مطابقة للمتوقع`;
      }
    }

    // ── 2. Update Shopify variant metafield: wordpress_variation_id ──
    // ⚠️ كانت هنا بدون أي فحص نتيجة قبل الرينيم (Step 5A مخالف بالكامل) —
    // فشل الميوتيشن كان بيعدّي كـ"تم" صامت. اتصلّح 25-08-2026: نتيجتها بقت
    // تتفحص وتتحوّل لـ status='warning' على مستوى الـ variation دي لو فشلت،
    // بدل ما تتجاهل تمامًا.
    let variantWarning = null;
    try {
      const varMetaResp   = await shopifyGQL(env, token, SET_VARIATION_ID_MUTATION, {
        metafields: [{
          ownerId:   match.id,
          namespace: 'custom',
          key:       'wordpress_variation_id',
          type:      'number_integer',
          value:     String(variation.id),
        }],
      }, 'metafieldsSet(wordpress_variation_id)');
      const varMetaResult = varMetaResp?.data?.metafieldsSet;
      const varMetaErrors = varMetaResult?.userErrors || [];
      if (varMetaErrors.length) throw new Error(varMetaErrors.map(e => e.message).join(' | '));
      if (!varMetaResult?.metafields?.length) throw new Error('شوبيفاي ما رجّعتش الميتافيلد المكتوب');
    } catch (e) {
      variantWarning = `wordpress_variation_id metafield failed: ${e.message}`;
      console.error(`Variant metafield write failed for variation ${variation.id}:`, e);
    }

    const combinedWarning = [variantWarning, priceWarning].filter(Boolean).join(' | ') || null;
    const priceNote = priceInfo
      ? `، السعر: regular=${priceInfo.regularPrice}${priceInfo.salePrice ? `/sale=${priceInfo.salePrice}` : ''}`
      : (priceWarning ? `، تحديث السعر فشل: ${priceWarning}` : '');

    const okLog = await safeWriteLog(env.DB, {
      tool:         TOOL_NAME,
      type:         combinedWarning ? 'error' : 'synced',
      employee,
      sku:          match.sku,
      productTitle: wooProduct.name,
      delta:        match.inventoryQuantity - (stockBefore ?? 0),
      valueBefore:  stockBefore,
      valueAfter:   match.inventoryQuantity,
      notes:        (variantWarning
                      ? `Size ${wcSize} — WC اتزامنت، Shopify metafield فشل: ${variantWarning}`
                      : `Size ${wcSize} synced`) + priceNote,
      extra: {
        wpProductId,
        variationId: variation.id,
        shopifyVariantId: shopifyVariantNumericId,
        ...(priceInfo ? { priceApplied: true, priceDifference, regularPrice: priceInfo.regularPrice, salePrice: priceInfo.salePrice } : {}),
      },
    });
    if (!okLog) loggedOk = false;

    results.push({
      variationId: variation.id,
      size: wcSize,
      status: combinedWarning ? 'warning' : 'synced',
      warning: combinedWarning,
      shopifyVariantId: shopifyVariantNumericId,
      sku: match.sku,
      stock: match.inventoryQuantity,
      ...(priceInfo ? { regularPrice: priceInfo.regularPrice, salePrice: priceInfo.salePrice } : {}),
    });
  }

  // ── آخر خطوة على الإطلاق: Tag "stylebox" فورًا (بدون انتظار — اتلغى v2.4.0) ──
  // معزول في try/catch زي باقي البلوكات: فشله بيخلّي النتيجة "warning" ومش
  // بيلغي أي حاجة اتعملت قبله.
  let tagAdded = null;
  let tagError = null;
  try {
    tagAdded = await addStyleboxTag(env, token, shopifyProductGid);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'product_meta_synced', employee,
      productTitle: productLevelResult?.newTitle || shopifyTitle,
      notes: `Tag "${STYLEBOX_TAG}" اتضاف (آخر خطوة)`,
      extra: { wpProductId, shopifyProductId, tag: STYLEBOX_TAG },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    tagError = e.message;
    console.error(`tagsAdd failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `Tag "${STYLEBOX_TAG}" failed: ${e.message}`,
      extra: { wpProductId, shopifyProductId },
    });
    if (!okLog) loggedOk = false;
  }

  // نتيجة العملية = 3 حالات مش اتنين (Step 5A ④ / ecommoda-html-builder Step 3C)
  const slugUnconfirmed = !!(slugFixed && !slugFixed.confirmed);
  const anyVariantWarning = results.some(r => r.status === 'warning');
  const anyVariantSynced  = results.some(r => r.status === 'synced');
  const overallStatus = productLevelError
    ? (anyVariantSynced ? 'warning' : 'error')
    : (anyVariantWarning || wcProductMetaError || tagError || slugUnconfirmed ? 'warning' : 'success');

  return {
    status: overallStatus,
    productLevel: productLevelResult,
    productLevelError,
    gtinRecoveredFromSku,
    wcProductMetaError,
    wcPublished,
    slugFixed,
    brand: wcBrandId ? { id: wcBrandId, name: shopifyVendor } : null,
    tag:        tagAdded,
    tagError,
    priceApplied: priceDifference !== null,
    priceDifference,
    variants: results,
    logged: loggedOk,
  };
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    // 1. CORS Preflight — ALWAYS first
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    // 2. WORKER_SECRET check — ALWAYS second
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ error: 'Unauthorized' }, 401, request);

    const url    = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    try {

      // ─── §AUTH — Universal D1 Auth (added 25-08-2026) ────────────
      if (action === 'check_employee') {
        const username = url.searchParams.get('username');
        if (!username) return json({ ok: false, error: 'username مطلوب' }, 400, request);
        const result = await checkEmployee(env.DB, username);
        return json({ ok: true, ...result }, 200, request);
      }

      if (action === 'register_pin') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);
        await registerPin(env.DB, username, pin);
        return json({ ok: true }, 200, request);
      }

      if (action === 'verify_employee') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);

        const displayName = await verifyEmployee(env.DB, username, pin);
        if (!displayName) return json({ ok: false, error: 'PIN خطأ أو المستخدم غير موجود' }, 401, request);

        const logged = await safeWriteLog(env.DB, {
          tool: TOOL_NAME, type: 'login', employee: username,
          notes: `دخول: ${displayName}`,
        });
        return json({ ok: true, displayName, logged }, 200, request);
      }

      if (action === 'log_logout') {
        const username = url.searchParams.get('username');
        let logged = true;
        if (username) {
          logged = await safeWriteLog(env.DB, {
            tool: TOOL_NAME, type: 'logout', employee: username,
            notes: `خروج: ${username.replace(/_/g, ' ')}`,
          });
        }
        return json({ ok: true, logged }, 200, request);
      }

      if (action === 'get_employees') {
        const { results } = await env.DB.prepare(
          'SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name'
        ).all();
        return json({ ok: true, employees: results }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      // ─── §FIND — read-only lookup, خطوة 1 في الواجهة (v2.4.0) ──────
      if (action === 'find_product') {
        const shopifyProductId = url.searchParams.get('shopify_product_id');
        if (!shopifyProductId) return json({ error: 'shopify_product_id required' }, 400, request);
        if (!/^\d+$/.test(shopifyProductId)) {
          return json({ error: 'shopify_product_id لازم يكون رقم فقط' }, 400, request);
        }
        // v2.7.0 — قبل أي بحث في ووكومرس: المنتج ده اتربط قبل كده؟ (custom.wordpress_id
        // مش فاضي على شوبيفاي). لو اتربط، بنوقف هنا ومنكملش بحث WC — راجع
        // checkShopifyAlreadyLinked().
        const alreadyLinked = await checkShopifyAlreadyLinked(env, shopifyProductId);
        if (alreadyLinked.linked) {
          return json({
            ok: true,
            alreadyLinked: true,
            wordpressId:   alreadyLinked.wordpressId,
            productTitle:  alreadyLinked.productTitle,
          }, 200, request);
        }
        const result = await findWcProductByShopifyId(env, shopifyProductId);
        return json({ ok: true, alreadyLinked: false, ...result }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      // ─── §SYNC — manual-only, single product per call ─────────────
      if (action === 'sync_product') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const body = await request.json().catch(() => ({}));
        if (!body.wp_product_id) return json({ error: 'wp_product_id required' }, 400, request);
        // shopify_status / add_star هما الخيارين الحاليين (v2.1.0). skip_draft /
        // skip_star القديمين لسه مقبولين كـ fallback عشان أي واجهة متخزّنة في
        // كاش المتصفح قبل التحديث ماتكسرش — بيتقرا منهم بس لو الجديد مش مبعوت.
        let shopifyStatus = String(body.shopify_status || '').toUpperCase();
        if (!shopifyStatus) shopifyStatus = body.skip_draft ? 'KEEP' : 'DRAFT';
        if (!SHOPIFY_STATUS_CHOICES.includes(shopifyStatus)) {
          return json({
            error: `shopify_status غير صالحة — المسموح: ${SHOPIFY_STATUS_CHOICES.join(' / ')}`,
          }, 400, request);
        }
        const addStar = body.add_star !== undefined ? !!body.add_star : !body.skip_star;

        // price_difference (v2.5.0) — اختياري، زي shopify_status/add_star بالظبط:
        // اتشال أكشن update_price المنفصل، وبقى خطوة جوه sync_product نفسها.
        // غير مبعوت/فاضي = مفيش تحديث سعر في التشغيلة دي خالص.
        let priceDifference = null;
        if (body.price_difference !== undefined && body.price_difference !== null && body.price_difference !== '') {
          const pd = Number(body.price_difference);
          if (!Number.isFinite(pd)) {
            return json({ error: 'price_difference لازم يكون رقم' }, 400, request);
          }
          priceDifference = pd;
        }

        const results = await syncProduct(env, body.wp_product_id, {
          shopifyStatus,
          addStar,
          priceDifference,
          employee: body.employee || null,
        });
        return json({ ok: true, wp_product_id: body.wp_product_id, results }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      // ─── §DIAG — Step 5A ⑨: إلزامي لأي Worker بيكتب ────────────────
      if (action === 'diag') {
        const envKeys = [
          'WORKER_SECRET', 'SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET',
          'WC_BASE_URL', 'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET',
        ];
        // ⚠️ أسماء وأطوال بس — ممنوع رجوع أي قيمة سر فعلية
        const envReport = envKeys.map(k => ({
          key: k,
          present: env[k] !== undefined && env[k] !== null && String(env[k]).trim() !== '',
          length: env[k] ? String(env[k]).length : 0,
        }));

        let shopifyScopes = null, shopifyError = null;
        try {
          const token = await getAccessToken(env);
          const scopeResp = await shopifyGQL(
            env, token,
            `{ currentAppInstallation { accessScopes { handle } } }`,
            {}, 'diag:accessScopes'
          );
          shopifyScopes = (scopeResp?.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
        } catch (e) { shopifyError = e.message; }

        let wcOk = false, wcError = null;
        try {
          const resp = await fetch(
            bust(`${wcBaseUrl(env)}/wp-json/wc/v3/products?per_page=1`),
            { headers: { Authorization: wcAuthHeader(env) } }
          );
          wcOk = resp.ok;
          if (!resp.ok) wcError = `HTTP ${resp.status}`;
        } catch (e) { wcError = e.message; }

        let d1Ok = false, d1Error = null;
        try { await env.DB.prepare('SELECT 1 AS ok').first(); d1Ok = true; }
        catch (e) { d1Error = e.message; }

        const origin = request.headers.get('Origin') || null;

        return json({
          ok: true,
          version: WORKER_VERSION,
          env: envReport,
          shopify: { scopes: shopifyScopes, error: shopifyError },
          woocommerce: { ok: wcOk, error: wcError },
          d1: { ok: d1Ok, error: d1Error },
          origin: { received: origin, allowed: ALLOWED_ORIGINS.includes(origin) },
        }, 200, request);
      }

      if (action === 'get_config') {
        return json({ ok: true, version: WORKER_VERSION }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      // ─── §LOG-ENDPOINTS — v2: get_logs / get_logs_count / get_logs_export ──
      if (action === 'get_logs') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const limit    = Math.min(parseInt(url.searchParams.get('limit')  || '100'), 100);
        const offset   = Math.max(parseInt(url.searchParams.get('offset') || '0'),    0);
        const entries  = await getLogs(env.DB, { tool: TOOL_NAME, employee, search, limit, offset });
        return json({ ok: true, entries }, 200, request);
      }

      if (action === 'get_logs_count') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const total    = await getLogsCount(env.DB, { tool: TOOL_NAME, employee, search });
        return json({ ok: true, total }, 200, request);
      }

      if (action === 'get_logs_export') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const entries  = await getLogsExport(env.DB, { tool: TOOL_NAME, employee, search });
        return json({ ok: true, entries }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      return json({ error: 'Unknown action' }, 404, request);
    } catch (err) {
      console.error(err);
      // ─── brand_missing (v2.6.0) — رد مُبنيَن عشان الواجهة تعرض نافذة خطأ
      // مخصصة بزرار "إضافة البراند على StyleBox" بدل رسالة عامة ───
      if (err instanceof BrandNotFoundError || err?.code === 'brand_missing') {
        return json({
          ok: false,
          error: err.message,
          code: 'brand_missing',
          vendor: err.vendor,
          addBrandUrl: err.addBrandUrl,
        }, 409, request);
      }
      return json({ error: err.message }, 500, request);
    }
  },

  // ⚠️ لا يوجد `scheduled()` عمدًا — الأداة manual-only (راجع §CONSTANTS فوق).
  // كان فيه Cron هنا قبل الرينيم بيشغّل sync_all تلقائي — اتشال بالكامل
  // 25-08-2026 طبقًا لـ woocommerce-sync-helper: "Trigger: manual only, via
  // Postman (NO Cron)" و"Removed: sync_all action (do not reintroduce)".
};
