// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// Worker: stylebox-products-linking-worker — EcomModa
// Tool:   Ecommoda StyleBox Products Linking
// Account: ecommoda-dev.workers.dev
// skills: worker-builder v3.0.0 · html-builder v7.0.0 · woocommerce-sync-helper v1.0.0
//         · ecommoda-constants v2.0.0 · shopify-graphql-helper v2.1.0 — 10-09-2026
//
// ⚠️ v2.13.0 (10-09-2026) — إعادة ربط منتج مربوط قبل كده، بشرط إثبات الهوية.
//   بطلب صريح من صاحب الأداة: حارس "اتربط قبل كده" (v2.7.0) كان بيوقف
//   find_product تمامًا — alreadyLinked:true ومفيش أي طريق للربط تاني من تاب
//   الربط الفردي خالص. دلوقتي الحارس بيسلّم لـ verifyExistingLink() (§FIND):
//   1) رقم ووردبريس من custom.wordpress_id **مش إثبات لوحده** — بنجيب منتج
//      ووكومرس ده ونتأكد إنه بيحمل نفس رقم شوبيفاي (GTIN حرفي أو بداية SKU،
//      نفس wcProductMatchesShopifyId اللي بيأكد أي بحث في الأداة). نفس منطق
//      حارس التعارض في find_product_relink بالظبط.
//   2) الإثبات موجود → relinkAllowed:true + نفس حقول نتيجة البحث العادية
//      (wp_product_id/productName/wpEditUrl) — الواجهة بتكمّل بحرّاسها المعتادة
//      (تأكيد إعادة الربط ← زرار المراجعة ← نافذة المراجعة ← خطوة ③).
//   3) الإثبات ناقص أو متعارض → relinkAllowed:false + relinkStatus بسبب مسمّى
//      (meta_invalid · meta_missing · cross_linked · unverified · duplicate)
//      + linkedProduct/searchProduct بتفاصيل الطرفين للعرض في نافذة الواجهة.
//      **مفيش أي كتابة في كل الحالات دي** — find_product لسه قراءة بس.
//   ⚠️ تكلفة النداءات في الحالة الغالبة: wcGetProduct واحد + فلتر GTIN واحد،
//   والمسح الاحتياطي متقفل (skipScan) لأن الإثبات في إيدنا — درس خنق ووكومرس
//   10-09-2026. البحث الكامل بالمسح بيحصل في حالات الرفض بس.

// ⚠️ v2.12.0 (10-09-2026) — جولة مطابقة للمهارات بعد مراجعة شاملة (skills-sweep).
//   البصمة كانت متجمّدة عند worker-builder v1.0.0 وhtml-builder v1.0.0 بينما
//   المهارتين بقوا v3.0.0 و v7.0.0 — الأداة اتبنت صح على قواعد قديمة، وورثت
//   بندين كانوا **كود غلط جوّه المهارة نفسها**. اللي اتصلّح هنا في الـ Worker:
//   1) §HELPERS::time — توقيت القاهرة بقى بيتحسب بـ Intl بدل إزاحة ثابتة +3
//      (constants §13). الثابت كان هيبقى غلط بساعة من 29-10-2026 **في صمت**.
//      نفس الدوال بالحرف في index.html.
//   2) §SHARED — كتلة السجل اتحدّثت للنسخة الحالية من shared-functions.md:
//      buildLogFilterSQL() واحدة للتلات دوال (كان SQL مكرر، و`type` بيتفلتر في
//      getLogs بس فالتصدير بينزّل غير المعروض) · LOG_SORT_COLUMNS قايمة بيضاء
//      مقفولة + orderByClause() بكاسر تعادل إلزامي · LOG_EXPORT_MAX ثابت مسمّى
//      · logParamsFrom() مصدر واحد لفلاتر التلات endpoints.
//   3) 🔴 عقد get_logs_export — بقى يرجّع {cap, total, truncated} جنب الصفوف.
//      قبل كده كان بيقص عند 2000 صف **في السكوت**، والواجهة بتقول "تم تصدير
//      N ✓" على شاشة وملف ناقصين. والعدّ بيتنادى بنفس الفلاتر بالظبط.
//   4) parseInt على limit/offset بقى محروس — parseInt('abc') → NaN بيوصل لـ D1
//      كـ bind ويرجّع خطأ غامض.
//   5) حارس WORKER_SECRET الغايب **قبل** مقارنة الـ auth — من غيره القالب
//      بينتج "Bearer undefined" وأي طلب معاه الهيدر ده بيعدّي على Worker كتابة.
//   6) extra.result بمفردات constants §12 على كل صف لوج. الفرق اللي البند
//      اتكتب عشانه: حارس البراند والتعارض ومقاس مالوش variant على شوبيفاي
//      **اتوقفوا قبل أي كتابة** → `rejected` مش `error`. ومقاس اتكتب على
//      ووكومرس وفشل ميتافيلد شوبيفاي بعده → `warning` مش `error` (كان بيعمل
//      حفرة مقفولة: الصف بيقول فشل والمقاس متزامن).
//      ⚠️ عمود `type` لسه بالقيم المسجّلة في constants §7 — تقسيم type بالأثر
//      الخارجي محتاج تسجيل `rejected` هناك الأول (راجع 🔴 معلّقة في CLAUDE.md).
//   7) نداء ووكومرس في diag بقى يعدّي من wcFetch (بـ maxAttempts:1) — كان
//      النداء الوحيد المتبقي بـ fetch مباشر.
//
// ⚠️ v2.10.0 (10-09-2026) — تصليح عطل حقيقي في أول تشغيلة Bulk على 15 منتج:
//   منتجان اتربطوا، التالت فشل بـ SKU مكرر، والرابع رجّع
//   `WC update product 20758 failed: 429` — ومن بعده **كل** نداء ووكومرس اترفض،
//   والواجهة عرضت الفشل ده كـ"مفيش منتج على ووردبريس بالرقم ده". تلات إصلاحات:
//   1) wcFetch() — كل نداءات ووكومرس بقت من باب واحد فيه retry وباكوف على
//      429/5xx/فشل الشبكة، واحترام Retry-After. قبل كده الـ retry كان لشوبيفاي
//      بس (shopifyGQL) وووكومرس من غير أي حماية — أول 429 = فشل نهائي.
//      الأخطاء بقت WcHttpError شايلة الـ status عشان الكولر يفرّق 404 عن 429.
//   2) findWcProductForRelink() بقت **ترفع** أي خطأ WC مش 404 بدل ما تبلعه في
//      fallback صامت — الرسالة بقت بتقول السبب الحقيقي (429/401/5xx) بدل
//      "مفيش منتج". و findWcProductByShopifyId() أخدت خيار skipScan، ومسار
//      Bulk بيستخدمه: المسح الاحتياطي (لحد 30 نداء لكل منتج) كان بيتنفّذ على
//      الفاضي بعد كل فشل وبيغذّي الخنق — دلوقتي متقفل في المسار الجماعي.
//   3) لوب المقاسات في syncProduct اتعزل في try/catch لكل مقاس — مقاس فاشل
//      (زي SKU مكرر) كان بيوقّع المنتج كله وبيمنع تاج stylebox وباقي المقاسات.
//      وكمان: كل المقاسات فشلت = overallStatus 'error' مش 'warning'.
//
// ⚠️ v2.9.0 (10-09-2026) — أكشن جديد find_product_relink (قراءة بس، زي
//   find_product بالظبط: مفيش كتابة ومفيش D1 log)، مخصّص **لمسار إعادة الربط
//   الجماعي (Bulk)** الجديد في الواجهة، بطلب صاحب الأداة. الفرق الوحيد عن
//   find_product إن المنتج **المربوط قبل كده مش حالة رفض هنا — ده الوضع
//   المتوقع**: بدل ما نقف عند حارس "اتربط قبل كده"، بناخد رقم ووردبريس من
//   metafield custom.wordpress_id نفسه ونرجّعه جاهز لإعادة الربط (مفيش بحث في
//   ووكومرس أصلاً — نداء واحد بدل ما يوصل لعشرات في المسح الاحتياطي).
//   ⚠️ find_product **متغيّرش خالص** — المسار الفردي في الواجهة لسه بيستخدمه
//   بحارس "اتربط قبل كده" زي ما هو. أي منتج لسه مش مربوط بيتبعت للبحث العادي
//   (findWcProductByShopifyId) كـ fallback. وفيه حارس تعارض: لو منتج ووردبريس
//   اللي الميتافيلد بيشاور عليه GTIN/SKU بتاعه بيقول رقم شوبيفاي **تاني**،
//   بيرجّع {found:false, conflict:true} من غير أي كتابة — ربط متقاطع غلط أسوأ
//   بكتير من "مش لقيته". راجع findWcProductForRelink() في §BULK.
//   الربط نفسه في المسار الجماعي بيستخدم sync_product الموجود زي ما هو، منتج
//   واحد لكل نداء (الواجهة بتلفّ عليهم بالترتيب) — مفيش sync_all ومفيش Cron،
//   الأداة لسه manual-only بالكامل.
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
//
// ⚠️ v2.8.0 (27-08-2026) — تحصين البحث ضد فروق العنوان بين المنصتين، بعد
// حالة حقيقية رجّعت "0 منتج مرشّح" لمنتج موجود فعلاً والـ SKU بتاعه بيبدأ
// بالرقم المطلوب، والسبب كان **مسافة واحدة زيادة** في العنوان على شوبيفاي:
//   (أ) العنوان بيتنضّف (أي تتابع مسافات → مسافة واحدة) وبيتبعت منه أول
//       TITLE_SEARCH_WORDS كلمات بس بدل العنوان كامل — buildTitleSearchQuery().
//   (ب) ملاذ أخير جديد: لو المحاولتين رجّعوا صفر مرشّحين، بيتعمل مسح مباشر
//       لمنتجات ووكومرس (الأحدث الأول) ومطابقة محلية على بداية الـ SKU —
//       wcScanProductsBySkuPrefix(). مستقل تمامًا عن العنوان، فبيغطي أي
//       اختلاف مهما كان (حرف، كلمة، عنوان مختلف بالكامل).
// الرد بقى فيه `scannedAll` — false معناها المسح وقف عند السقف (أو فشل)،
// يعني "مش لقيته" مش قاطعة والواجهة بتقول للموظف كده صراحةً. القبول النهائي
// **متغيّرش خالص**: GTIN حرفي أو SKU بيبدأ بالرقم، أبدًا مش بالعنوان.
// ══════════════════════════════════════════════════════════════
const TOOL_NAME      = 'stylebox_products_linking'; // ecommoda-constants §7 — renamed from shopify_woo_sync 25-08-2026
const WORKER_VERSION = 'v2.13.0';

// ─── §CONSTANTS::find — إعدادات البحث في find_product (v2.8.0) ───
// عدد الكلمات اللي بتتبعت من عنوان شوبيفاي لـ search= بتاع ووكومرس. العنوان
// أصلاً بيُستخدم **لتضييق النطاق بس** (التأكيد النهائي حرفي بالـ GTIN/SKU)،
// فكل ما الاستعلام يقصر كل ما الشبكة تتوسّع والحساسية لفروق العنوان تقل.
// 4 كلمات بتكفي عادةً لتمييز المنتج (براند + موديل) من غير ما ترجّع نص الكتالوج.
const TITLE_SEARCH_WORDS = 4;

// حدود المسح الاحتياطي بالـ SKU (الملاذ الأخير لما البحث بالـ GTIN وبالعنوان
// يرجّعوا صفر مرشّحين). 100 هو أقصى per_page مسموح في ووكومرس REST.
// السقف 30 صفحة = 3000 منتج = 30 subrequest كحد أقصى في الحالة النادرة دي —
// تحت حد الـ subrequests بتاع Cloudflare Workers، ومعظم الحالات بتتلاقى في
// أول صفحة أو صفحتين لأن الترتيب من الأحدث. لو المتجر عدّى 3000 منتج، زوّد
// السقف ده (الواجهة بتنبّه الموظف لما المسح يقف من غير ما يخلص).
const SKU_SCAN_PER_PAGE  = 100;
const SKU_SCAN_MAX_PAGES = 30;

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

// ─── §HELPERS::time — توقيت القاهرة يتحسب، مايتكتبش ثابت ───
// 🔴 ecommoda-constants §13 · worker-builder v3.0.0 Step 7.
// الإزاحة الثابتة (+3) بقت غلط: التوقيت الصيفي بيخلص 29-10-2026، والثابت
// **مابيشتكيش** لما يبقى غلط — كل وقت معروض بيزحف ساعة في صمت.
// ⚠️ **نفس الدوال بالحرف في الـ Worker وفي الواجهة** (index.html §SHELL-JS) —
//    نسختين مختلفتين = الشاشة والسجل بيقولوا وقتين مختلفين لنفس الصف.
const CAIRO_TZ = 'Africa/Cairo';
const _cairoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function cairoParts(d) {
  const o = {};
  for (const p of _cairoFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';        // حارس: بعض المحركات بترجّع 24
  return o;
}
function cairoOffsetMinutes(d) {             // ١٨٠ صيفًا · ١٢٠ شتاءً
  const p = cairoParts(d);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day,
                              +p.hour, +p.minute, +p.second) - d.getTime()) / 60000);
}
function cairoDateStr(iso) {                 // 'YYYY-MM-DD' بتوقيت القاهرة
  const p = cairoParts(iso ? new Date(iso) : new Date());
  return `${p.year}-${p.month}-${p.day}`;
}
// حدود يوم تقويمي بالقاهرة → UTC — الإزاحة تتقاس عند **ظهر** اليوم
// (أي تحويل توقيت بيحصل فجرًا، فالظهر بيدّي إزاحة اليوم الصحيحة)
function cairoDayBoundsUTC(dateStr) {
  const offMin = cairoOffsetMinutes(new Date(`${dateStr}T12:00:00.000Z`));
  return {
    start: new Date(Date.parse(`${dateStr}T00:00:00.000Z`) - offMin * 60000).toISOString(),
    end:   new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offMin * 60000).toISOString(),
  };
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

const LOG_EXPORT_MAX = 2000;   // سقف التصدير — بيرجع للواجهة كـ `cap`

/**
 * بنّاء شرط الفلترة الموحّد للسجل — التلات دوال تحته بتستخدمه، فمفيش SQL
 * مكرر يتعتّق في واحدة منهم ويسيب التانية.
 *
 * كل الباراميترات **اختيارية**، والسلوك من غيرها **مطابق للنسخة القديمة
 * بالحرف** — الإضافة متوافقة رجوعيًا ١٠٠٪:
 *   employees[] / types[]  → قوايم. multi-select إلزامي في أي شاشة فيها جدول
 *                            (`ecommoda-html-builder` → data-table-standard.md
 *                            بند ٢١)، والسجل بقى جدول (بند ٢٦).
 *   employee / type        → قيمة واحدة — متسابة للتوافق مع واجهات قديمة.
 *   dateFrom / dateTo      → بيتقارنوا بـ substr(timestamp,1,10) — يعني **UTC**،
 *                            والعرض بتوقيت القاهرة. فرق الساعتين/التلاتة ممكن
 *                            يحط عملية بعد ٩ مساءً في يوم UTC اللي بعده. مقبول
 *                            لفلتر بالأيام — **بس مكتوب**، عشان مايتكتشفش
 *                            كباج بعدين.
 * login/logout مستثنيين في SQL دايمًا — مش client-side.
 */
function buildLogFilterSQL(select, {
  tool      = null,
  employee  = null, employees = null,
  type      = null, types     = null,
  search    = null,
  dateFrom  = null, dateTo    = null,
} = {}) {
  let sql = `${select} FROM logs WHERE type NOT IN ('login','logout')`;
  const b = [];

  const emps = Array.isArray(employees) && employees.length ? employees : (employee ? [employee] : []);
  const typs = Array.isArray(types)     && types.length     ? types     : (type     ? [type]     : []);

  if (tool) { sql += ' AND tool = ?'; b.push(tool); }
  if (emps.length) {
    sql += ` AND employee IN (${emps.map(() => '?').join(',')})`; b.push(...emps);
  }
  if (typs.length) {
    sql += ` AND type IN (${typs.map(() => '?').join(',')})`; b.push(...typs);
  }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) { sql += ' AND substr(timestamp, 1, 10) >= ?'; b.push(dateFrom); }
  if (dateTo)   { sql += ' AND substr(timestamp, 1, 10) <= ?'; b.push(dateTo); }

  return { sql, b };
}

/**
 * Fetch logs from D1 with server-side filtering + pagination.
 * Max limit per page: 100 (enforced server-side).
 *
 * ⚠️ Do NOT use this for XLSX export — use getLogsExport() instead.
 */
async function getLogs(db, { limit = 100, offset = 0, sortBy, sortDir, ...filters } = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + orderByClause(sortBy, sortDir) + ' LIMIT ? OFFSET ?';
  return (await db.prepare(q)
    .bind(...b, Math.min(limit, 100), Math.max(offset, 0)).all()).results;
}

// ⚠️ قائمة **مقفولة** — القيمة جاية من العميل وبتتلزق في نص SQL مباشرةً
//    (ORDER BY مابيقبلش bind). أي قيمة بره القايمة بترجع للافتراضي بدون خطأ.
// ⚠️ المفاتيح لازم تطابق `data-sort-key` في الواجهة **حرفيًا** — مفتاح مش في
//    القايمة بيرجع للافتراضي في صمت، فالعمود يبان إنه اترتّب وهو مااترتّبش.
const LOG_SORT_COLUMNS = {
  date: 'timestamp', time: 'timestamp', employee: 'employee', type: 'type',
  sku: 'sku', product: 'product_title', result: `json_extract(extra, '$.result')`,
};

function orderByClause(sortBy, sortDir) {
  const col = LOG_SORT_COLUMNS[String(sortBy || '')] || 'timestamp';
  const dir = String(sortDir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  // 🔴 كاسر تعادل إلزامي: من غيره صفوف نفس القيمة بترتيب عشوائي بين الصفحات،
  //    والصف الواحد ممكن يظهر في صفحتين **أو مايظهرش خالص**.
  return col === 'timestamp' ? ` ORDER BY timestamp ${dir}`
                             : ` ORDER BY ${col} ${dir}, timestamp DESC`;
}

/**
 * Count total matching log rows.
 * بيتنادى بالتوازي مع getLogsExport() عشان الواجهة تعرف إن التصدير اتقص.
 */
async function getLogsCount(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT COUNT(*) as total', filters);
  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

/**
 * Fetch all matching logs for XLSX export — up to LOG_EXPORT_MAX rows.
 *
 * ⚠️ الدالة دي **بتقص في السكوت** بطبيعتها. المسؤولية اللي جنبها إلزامية:
 * الـ endpoint لازم يرجّع `cap` و`total` و`truncated` كمان.
 */
async function getLogsExport(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  // ⚠️ التصدير والعدّ **بيتجاهلوا الترتيب عن قصد** — العدّ مالوش ترتيب،
  //    والتصدير بياخد ترتيب السيرفر الافتراضي. تمرير sortBy/sortDir ليهم بيفتح
  //    باب اختلاف مصدر الباراميترات بين النداءات = تصدير مش مطابق للشاشة.
  const q = sql + ' ORDER BY timestamp DESC LIMIT ?';
  return (await db.prepare(q).bind(...b, LOG_EXPORT_MAX).all()).results;
}

/**
 * بيقرا فلاتر السجل من الـ query string — CSV للقوايم
 * (employees=ahmed,sara · types=synced,error).
 * الاسم المفرد لسه مقبول للتوافق الرجعي.
 */
function logParamsFrom(url, tool) {
  const csv = (k) => (url.searchParams.get(k) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const employees = csv('employees'), types = csv('types');
  return {
    tool,
    employees: employees.length ? employees : null,
    employee:  url.searchParams.get('employee') || null,
    types:     types.length ? types : null,
    type:      url.searchParams.get('type')     || null,
    search:    url.searchParams.get('search')   || null,
    dateFrom:  url.searchParams.get('dateFrom') || null,
    dateTo:    url.searchParams.get('dateTo')   || null,
  };
}

// ─── §SHARED::RESULT — مفردات extra.result الرسمية (ecommoda-constants §12) ───
// خمس قيم مقفولة، والواجهة بتلوّن منها. الفرق اللي البند اتكتب عشانه:
//   error    = **حاولنا** — النداء وصل للنظام الخارجي واترفض        → أحمر
//   rejected = اتوقف **قبل** أي محاولة (حارس/تعارض/مدخل مجهول)      → محايد
//   already  = الحالة المستهدفة موجودة أصلاً، مفيش حاجة كانت مطلوبة → محايد
// 🔴 rejected و already **ممنوع** يتعدّوا فشل — وإلا كل تقرير عن نسبة فشل
//    الأداة بيعدّ حالات ما اتلمسش فيها ولا منصة كأنها أعطال حقيقية.
const RESULT = {
  SUCCESS:  'success',
  WARNING:  'warning',
  ERROR:    'error',
  REJECTED: 'rejected',
  ALREADY:  'already',
};

// ⚠️ عمود `type` لسه بالقيم المسجّلة للأداة دي في `ecommoda-constants` §7
//    (`product_meta_synced` · `synced` · `error` · `login` · `logout`).
//    تقسيم `type` بالأثر الخارجي (worker-builder Step 5A ⑭) بيحتاج قيمة
//    `rejected` **تتسجّل في §7 الأول** (Rule 7) — جدول `logs` مشترك بين كل
//    أدوات الستاك، وقيمة غير مسجّلة بتنتج صفوف يتيمة. لحد ما دي تحصل،
//    التمييز بيتم بـ `extra.result` وهو اللي أي استعلام خط أساس بيفلتر عليه:
//      … AND type = 'synced' AND json_extract(extra,'$.result') = 'success'
//    راجع سطر `🔴 معلّقة` في CLAUDE.md.

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

// ─── §WOOCOMMERCE::wcFetch — v2.10.0، الباب الوحيد لكل نداءات ووكومرس ───
// ⚠️ اتضاف بعد عطل حقيقي (10-09-2026): تشغيلة Bulk على 15 منتج خنقت ووكومرس —
// المنتج الرابع رجّع `WC update product 20758 failed: 429`، ومن بعده **كل** نداء
// WC اترفض، والواجهة كانت بتعرض الفشل ده كـ"مفيش منتج على ووردبريس بالرقم ده"
// (خطأ بنية تحتية اتقرا كـ"مش موجود"). السبب الجذري: نداءات ووكومرس كانت
// **من غير أي retry ولا باكوف** — أول 429 = فشل نهائي — على عكس shopifyGQL
// اللي عندها العقد ده من v2.0.0.
//
// القواعد هنا (نفس منطق shopifyGQL بالظبط، بس لووكومرس):
//   • إعادة المحاولة على 429 و5xx وفشل الشبكة — لحد WC_MAX_ATTEMPTS.
//   • احترام هيدر Retry-After لو ووكومرس بعتته (بالثواني)، وإلا باكوف تربيعي.
//   • الأخطاء بترجع كـ WcHttpError شايلة الـ status — عشان الكولر يفرّق بين
//     404 (مش موجود فعلاً) و429/5xx/401 (خنق أو عطل)، والفرق ده هو اللي منع
//     تكرار العطل فوق. راجع findWcProductForRelink().
//   • نص رسالة الخطأ **متغيّرش** عن النسخ القديمة عمدًا (الواجهة والسجل بيعرضوه).
class WcHttpError extends Error {
  constructor(message, status, body = '') {
    super(message);
    this.name    = 'WcHttpError';
    this.status  = status;
    this.wcBody  = body;
  }
}

const WC_MAX_ATTEMPTS   = 3;
const WC_RETRY_BASE_MS  = 800;    // 800ms ← 3200ms (تربيعي)
const WC_RETRY_MAX_MS   = 8000;   // سقف انتظار المحاولة الواحدة

function wcBackoffMs(attempt, retryAfterHeader) {
  const headerSec = Number(retryAfterHeader);
  if (Number.isFinite(headerSec) && headerSec > 0) return Math.min(headerSec * 1000, WC_RETRY_MAX_MS);
  return Math.min(WC_RETRY_BASE_MS * attempt * attempt, WC_RETRY_MAX_MS);
}

// label = بادئة رسالة الخطأ زي ما كانت بالظبط ("WC get product 123")
async function wcFetch(env, url, { label, method = 'GET', payload = null, cacheBust = true, maxAttempts = WC_MAX_ATTEMPTS } = {}) {
  const headers = { Authorization: wcAuthHeader(env) };
  if (payload !== null) headers['Content-Type'] = 'application/json';

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp;
    try {
      resp = await fetch(cacheBust ? bust(url) : url, {
        method,
        headers,
        ...(payload !== null ? { body: JSON.stringify(payload) } : {}),
      });
    } catch (e) {
      // فشل شبكة/DNS/timeout — قابل لإعادة المحاولة زي 5xx
      lastError = new Error(`${label} failed: تعذّر الوصول لووكومرس (${e.message})`);
      if (attempt < maxAttempts) { await new Promise(r => setTimeout(r, wcBackoffMs(attempt))); continue; }
      throw lastError;
    }

    if (resp.ok) return resp.json();

    const errText    = await resp.text().catch(() => '');
    const retryAfter = resp.headers.get('Retry-After');
    // Retry-After بيتحط في نص الخطأ عمدًا (v2.11.0): الواجهة بتقراه منه عشان
    // تستنى المدة اللي الاستضافة طالباها فعلاً بدل رقم ثابت مخمّن، والموظف
    // بيشوف "استنى كام" بدل "429" مجردة.
    lastError = new WcHttpError(
      `${label} failed: ${resp.status}` +
      (retryAfter ? ` (Retry-After: ${retryAfter}s)` : '') +
      (errText ? ` ${errText}` : ''),
      resp.status,
      errText
    );
    lastError.retryAfter = retryAfter || null;
    const retriable = resp.status === 429 || resp.status >= 500;
    if (retriable && attempt < maxAttempts) {
      console.warn(`${label}: ${resp.status} — محاولة ${attempt}/${maxAttempts}، هنستنى ونعيد`);
      await new Promise(r => setTimeout(r, wcBackoffMs(attempt, resp.headers.get('Retry-After'))));
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

async function wcGetProduct(env, wpProductId) {
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}`, {
    label: `WC get product ${wpProductId}`,
  });
}

// ─── §WOOCOMMERCE::wcSearchProducts — v2.4.0، خطوة 1 (find_product) ───
// wrapper عام حوالين GET /wc/v3/products بأي query params (search / sku /
// global_unique_id / per_page...). بيرمي زي أي نداء WC تاني في الملف — مفيش
// فحص خاص هنا، الفحص الفعلي (هل النتيجة بتطابق فعلًا) بيحصل في
// findWcProductByShopifyId() اللي بتستخدمها.
async function wcSearchProducts(env, params) {
  const qs = new URLSearchParams(params).toString();
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products?${qs}`, {
    label: 'WC search products',
  });
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
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/brands?${qs}`, {
    label: 'WC search brands',
  });
}

// مطابقة حرفية (case-insensitive، بعد trim) — مش بحث تقريبي. الاسم لازم يطابق
// اسم الـ Vendor على شوبيفاي بالظبط، وإلا العملية بتُعتبر "مفيش براند" (تتوقف).
// ─── §WOOCOMMERCE::brandCache — v2.11.0 ───
// نفس الـ Vendor بيتسأل عنه مع **كل منتج** في القائمة (كل تشغيلة Bulk فيها
// براند أو اتنين بس عادةً)، وده نداء ووكومرس كامل في كل مرة على متجر بيحجب
// عند ~30 نداء. الكاش على مستوى الـ isolate — بيعيش بين الطلبات المتتالية.
//
// ⚠️ الإيجابي بس هو اللي بيتخزّن: لو البراند مش موجود، الحارس بيوقف الربط
// والموظف بيضيفه على ووردبريس — لازم المحاولة اللي بعدها تسأل من جديد وتلاقيه،
// مش تقراه من كاش قديم بيقول "مش موجود".
const BRAND_CACHE_TTL_MS = 10 * 60 * 1000;
const brandCache = new Map();   // vendor(lowercase) → { brand, at }

async function wcFindBrandByName(env, vendorName) {
  const target = vendorName.trim().toLowerCase();
  const hit    = brandCache.get(target);
  if (hit && (Date.now() - hit.at) < BRAND_CACHE_TTL_MS) return hit.brand;

  const results = await wcSearchBrands(env, { search: vendorName, per_page: 100 });
  if (!Array.isArray(results)) return null;
  const brand = results.find(b => String(b?.name || '').trim().toLowerCase() === target) || null;
  if (brand) brandCache.set(target, { brand, at: Date.now() });
  return brand;
}

// ─── §HELPERS::buildTitleSearchQuery — v2.8.0 (تضييق نطاق البحث بالعنوان) ───
// بياخد عنوان المنتج من شوبيفاي وبيرجّع الاستعلام اللي بيتبعت لـ search= بتاع
// ووكومرس: أي تتابع مسافات (بما فيها المسافات غير العادية زي NBSP) بيبقى مسافة
// واحدة، وبناخد أول TITLE_SEARCH_WORDS كلمات بس.
// السبب (حالة حقيقية 27-08-2026): العنوان على شوبيفاي كان فيه **مسافة واحدة
// زيادة** قبل "– in Dark brown" مقارنة بعنوان ووردبريس، والبحث بالعنوان كامل
// رجّع صفر مرشّحين رغم إن المنتج موجود والـ SKU بتاعه بيبدأ بالرقم المطلوب.
// تقصير الاستعلام بيخلي البحث محصّن كمان ضد أي اختلاف في الكلمات المتأخرة.
// ⚠️ ده بيوسّع المرشّحين بس — التأكيد النهائي لسه حرفي بالـ GTIN/SKU
// (wcProductMatchesShopifyId)، فمرشّح زيادة مالوش أي أثر غير إننا بنفحصه.
function buildTitleSearchQuery(title) {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.split(' ').slice(0, TITLE_SEARCH_WORDS).join(' ');
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
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}`, {
    label:     `WC update product ${wpProductId}`,
    method:    'PUT',
    payload,
    cacheBust: false,
  });
}

async function wcGetVariations(env, wpProductId) {
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}/variations?per_page=100`, {
    label: `WC get variations for ${wpProductId}`,
  });
}

// ─── §WOOCOMMERCE::wcBatchUpdateVariations — v2.11.0 ───
// كل مقاسات المنتج في **نداء واحد** بدل نداء لكل مقاس. الـ endpoint ده رسمي في
// ووكومرس (نفس نمط /products/batch — راجع woocommerce-sync-helper Step 4،
// السقف 100 عنصر لكل نداء والمقاسات ليها endpoint منفصل زي ما هو مستخدم هنا).
//
// ⚠️ السبب: `stylebox.online` بيحجب عند ~30 نداء (429 برد فاضي — طبقة الاستضافة
// مش ووكومرس). المقاسات كانت 5-6 نداءات من أصل ~10 لكل منتج، دلوقتي واحد،
// فالمنتجات اللي بتعدّي قبل الحجب بقت تقريبًا الضِعف.
//
// ⚠️ الرد بيرجع **200 حتى لو مقاس فشل** — الفشل بييجي جوه عنصر المقاس نفسه
// (`{id, error:{code,message,data}}`)، فالكولر لازم يقرا كل عنصر على حدة.
// ده بالظبط اللي بيخلي عزل المقاسات (v2.10.0) شغّال زي ما هو.
const WC_VARIATION_BATCH_MAX = 50;   // تحت سقف ووكومرس (100) بهامش أمان

async function wcBatchUpdateVariations(env, wpProductId, updates) {
  const merged = { update: [] };
  for (let i = 0; i < updates.length; i += WC_VARIATION_BATCH_MAX) {
    const chunk = updates.slice(i, i + WC_VARIATION_BATCH_MAX);
    const resp  = await wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}/variations/batch`, {
      label:     `WC batch update variations (${chunk.length}) for ${wpProductId}`,
      method:    'POST',
      payload:   { update: chunk },
      cacheBust: false,
    });
    if (Array.isArray(resp?.update)) merged.update.push(...resp.update);
  }
  return merged;
}

// ⚠️ متسابة عمدًا: لسه بتُستخدم لو احتاج حد يحدّث مقاس واحد بره الدفعة.
async function wcUpdateVariation(env, wpProductId, variationId, payload) {
  return wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products/${wpProductId}/variations/${variationId}`, {
    label:     `WC update variation ${variationId}`,
    method:    'PUT',
    payload,
    cacheBust: false,
  });
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
// §FIND::findWcProductByShopifyId — v2.4.0 (بحث بالعنوان اتضاف v2.5.0،
// مسح الـ SKU الاحتياطي اتضاف v2.8.0)
// الموظف بيدخل رقم منتج شوبيفاي، والدالة دي بتدوّر على منتج ووكومرس اللي
// GTIN بتاعه (global_unique_id) بيساوي الرقم، أو الرقم في بداية الـ SKU —
// نفس ريجيكس extractGtinFromSku فوق، لكن بالعكس (هنا الرقم معروف من الأول،
// وبندوّر بيه على المنتج بدل ما نستخرجه من SKU منتج معروف).
//
// تلات محاولات لتجميع المرشحين، لكن **القبول النهائي بيعتمد على GTIN/SKU بس**:
//   1. فلتر global_unique_id مباشر على /wc/v3/products — رسمي في ووكومرس
//      9.2+، بيرجّع تطابق دقيق فورًا. ✅ مؤكَّد شغّال على stylebox.online
//      (تجربة حقيقية 26-08-2026 — راجع CLAUDE.md).
//   2. بحث بعنوان المنتج على شوبيفاي (search=) — ⚠️ العنوان هنا **لتضييق
//      نطاق البحث بس، مش تأكيد نهائي**: ممكن يكون فيه منتجين بنفس العنوان،
//      أو العنوان يختلف جزئيًا بين المنصتين. البديل عن محاولة 2 القديمة
//      (search= بالرقم نفسه) اللي اتأكد فعليًا (26-08-2026) إن ووكومرس هنا
//      مش بيدوّر بيها على الـ SKU — رجّعت صفر مرشّحين حتى لمنتج SKU بتاعه
//      بيبدأ حرفيًا بالرقم المطلوب.
//      ⚠️ v2.8.0: العنوان بيتنضّف (تجميع أي تتابع مسافات لمسافة واحدة) وبيتبعت
//      **أول TITLE_SEARCH_WORDS كلمات بس** بدل العنوان كامل — حالة حقيقية
//      (27-08-2026) رجّعت صفر مرشّحين بسبب **مسافة واحدة زيادة** في نص العنوان
//      على شوبيفاي مقارنة بووردبريس. تقصير الاستعلام بيوسّع شبكة المرشّحين،
//      والمرشّحين الزيادة مالهمش أي ضرر لأن التأكيد النهائي حرفي (GTIN/SKU).
//   3. (v2.8.0) **مسح احتياطي بالـ SKU** — بيشتغل بس لو 1 و2 رجّعوا صفر
//      مرشّحين. بيمشي على منتجات ووكومرس صفحة صفحة (الأحدث الأول) وبيطابق
//      محليًا على "الـ SKU بيبدأ بالرقم ده". مستقل تمامًا عن العنوان، فبيغطي
//      أي اختلاف مهما كان (حرف، كلمة، عنوان مختلف بالكامل). راجع
//      wcScanProductsBySkuPrefix().
// القبول النهائي القاطع من بين كل المرشّحين: GTIN == الرقم حرفيًا، أو SKU
// يبدأ بالرقم ده تحديدًا — العنوان **مايُستخدمش أبدًا** كتأكيد.
// ══════════════════════════════════════════════════════════════

// بيحدّد إذا كان منتج ووكومرس ده هو المطابق لرقم شوبيفاي المطلوب — التأكيد
// القاطع الوحيد في الأداة كلها (GTIN حرفي أو SKU بيبدأ بالرقم)، مشترك بين
// التأكيد على المرشّحين والمسح الاحتياطي عشان القاعدة تفضل في مكان واحد.
function wcProductMatchesShopifyId(product, idStr) {
  if (!product) return false;
  if (String(product.global_unique_id || '').trim() === idStr) return true;
  const skuMatch = String(product.sku || '').match(/^(\d{6,})-/);
  return !!(skuMatch && skuMatch[1] === idStr);
}

// ─── §FIND::wcScanProductsBySkuPrefix — v2.8.0، الملاذ الأخير ───
// بحث ووكومرس (search=) مش بيدوّر على الـ SKU خالص (مؤكَّد 26-08-2026)، وفلتر
// الـ GTIN بيفشل لأي منتج لسه مش مربوط. فلما الاتنين يرجّعوا صفر، الطريقة
// الوحيدة المضمونة للوصول لمنتج الـ SKU بتاعه بيبدأ بالرقم هي المرور على
// المنتجات نفسها. `_fields` بيقلّل حجم الرد جدًا (4 حقول بس بدل الكائن
// الكامل)، و orderby=date&order=desc بيخلي المنتجات المضافة حديثًا — وهي
// الحالة الغالبة هنا — تتلاقى في أول صفحة أو صفحتين. بيقف فورًا أول ما يلاقي.
async function wcScanProductsBySkuPrefix(env, idStr) {
  for (let page = 1; page <= SKU_SCAN_MAX_PAGES; page++) {
    const batch = await wcSearchProducts(env, {
      per_page: SKU_SCAN_PER_PAGE,
      page,
      orderby: 'date',
      order:   'desc',
      _fields: 'id,name,sku,global_unique_id',
    });
    if (!Array.isArray(batch) || batch.length === 0) {
      return { match: null, scanned: (page - 1) * SKU_SCAN_PER_PAGE, exhausted: true };
    }

    const hit = batch.find(p => wcProductMatchesShopifyId(p, idStr));
    if (hit) {
      return { match: hit, scanned: (page - 1) * SKU_SCAN_PER_PAGE + batch.length, exhausted: true };
    }

    // آخر صفحة (رجّعت أقل من المطلوب) — مفيش داعي نطلب صفحة تانية
    if (batch.length < SKU_SCAN_PER_PAGE) {
      return { match: null, scanned: (page - 1) * SKU_SCAN_PER_PAGE + batch.length, exhausted: true };
    }
  }
  // وصلنا لسقف الصفحات من غير ما نخلّص المنتجات — النتيجة "مش لقيته" لكن
  // المسح **مش كامل**، والواجهة بتقول للموظف كده صراحةً بدل ما توهمه إن
  // المنتج مش موجود أصلاً.
  return { match: null, scanned: SKU_SCAN_MAX_PAGES * SKU_SCAN_PER_PAGE, exhausted: false };
}

// opts.skipScan (v2.10.0) — بيقفل المسح الاحتياطي (المرحلة 3) تمامًا. بيتبعت
// من مسار Bulk بس: هناك رقم ووردبريس معروف أصلاً من الميتافيلد، فالمسح (لحد 30
// نداء لكل منتج) بيبقى رمي في الفاضي — وهو اللي خنق ووكومرس فعليًا 10-09-2026
// (429 من المنتج الرابع وطول القائمة بعده). راجع findWcProductForRelink().
async function findWcProductByShopifyId(env, shopifyProductId, { skipScan = false } = {}) {
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
    // v2.8.0: تنضيف المسافات + أول كلمات بس — راجع تعليق المحاولة 2 فوق
    const titleQuery = buildTitleSearchQuery(shopifyTitle);
    if (titleQuery) {
      const byTitle = await wcSearchProducts(env, { search: titleQuery, per_page: 50 });
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
  let match      = unique.find(p => wcProductMatchesShopifyId(p, idStr)) || null;
  let scanned    = unique.length;
  let scannedAll = true;
  let matchedVia = 'search';

  // ── (v2.8.0) الملاذ الأخير: مسح بالـ SKU، مستقل تمامًا عن العنوان ──
  // (v2.10.0) بيتخطّى بالكامل لو skipScan — والنتيجة ساعتها بتقول كده صراحةً
  // (scanSkipped) عشان الواجهة ماتقولش "مفحصناش كل المنتجات" وكأنه عطل.
  if (!match && skipScan) {
    return { found: false, scanned, scannedAll: false, scanSkipped: true };
  }
  if (!match) {
    try {
      const scan = await wcScanProductsBySkuPrefix(env, idStr);
      match      = scan.match;
      scanned    = unique.length + scan.scanned;
      scannedAll = scan.exhausted;
      if (match) matchedVia = 'scan';
    } catch (e) {
      // المسح آخر محاولة — فشله معناه إننا مش قادرين نجزم إن المنتج مش
      // موجود، فبنقول كده صراحةً (scannedAll=false) بدل "مفيش تطابق" قاطعة
      console.error('find_product: SKU prefix scan failed:', e);
      scannedAll = false;
    }
  }

  if (!match) {
    return { found: false, scanned, scannedAll };
  }

  return {
    found: true,
    wp_product_id: match.id,
    productName: match.name,
    sku: match.sku,
    matchedBy: String(match.global_unique_id || '').trim() === idStr ? 'gtin' : 'sku',
    matchedVia,
    wpEditUrl: `${wcBaseUrl(env)}/wp-admin/post.php?post=${match.id}&action=edit`,
  };
}

// ══════════════════════════════════════════════════════════════
// §FIND::verifyExistingLink — v2.13.0 (إعادة الربط لمنتج مربوط قبل كده)
// بطلب صريح من صاحب الأداة (10-09-2026): حارس "اتربط قبل كده" (v2.7.0) كان
// بيوقف find_product تمامًا عند alreadyLinked:true. دلوقتي بيكمّل — لكن
// **بشرط واحد قاطع**: إن المنتج اللي الميتافيلد بيشاور عليه هو **نفسه**
// المنتج اللي يخص رقم شوبيفاي ده فعلاً. الشرط ده بيتحقق منه هنا، والنتيجة
// إما إعادة ربط مسموحة أو رفض بسبب مسمّى وتفاصيل الطرفين للعرض في الواجهة.
//
// ⚠️ الإثبات هو نفس قاعدة القبول في كل الأداة — GTIN حرفي أو بداية SKU
// (wcProductMatchesShopifyId)، **مش العنوان ولا رقم الميتافيلد لوحده**:
// ميتافيلد قديم/غلط يقدر يخلّي الأداة تكتب مخزون وأسعار منتج على منتج تاني
// خالص (نفس منطق حارس التعارض في find_product_relink، §BULK).
//
// الحالات (relinkStatus):
//   • match        → إثبات موجود، وإعادة الربط مسموحة (relinkAllowed:true)
//   • meta_invalid → قيمة custom.wordpress_id مش رقم منتج صالح
//   • meta_missing → المنتج اللي بتشاور عليه مش موجود على ووردبريس (404)
//   • cross_linked → منتج ووكومرس ده بيحمل رقم شوبيفاي **تاني** (أخطر حالة)
//   • unverified   → مفيش GTIN ولا بادئة SKU على منتج ووكومرس = مفيش إثبات هوية
//   • duplicate    → الإثبات موجود، لكن البحث المستقل لقى منتج ووكومرس **تاني**
//                    بنفس الرقم (GTIN مكرر) — مين فيهم الصح مش قرار الأداة
//
// تكلفة النداءات: في الحالة الغالبة (match) نداء wcGetProduct واحد + فلتر
// GTIN واحد — والمسح الاحتياطي **متقفل** (skipScan) لأن الإثبات موجود أصلاً،
// فمفيش 30 نداء على الفاضي (نفس درس الخنق 10-09-2026). في حالات الرفض بس
// بيتعمل بحث كامل — عشان الواجهة تقدر تقول للموظف المنتج الصح رقمه كام.
// ══════════════════════════════════════════════════════════════
function wcProductLinkMarks(product) {
  const gtin      = String(product?.global_unique_id || '').trim();
  const skuPrefix = (String(product?.sku || '').match(/^(\d{6,})-/) || [])[1] || '';
  return { gtin, skuPrefix };
}

function wcProductSummary(env, product) {
  if (!product || !product.id) return null;
  const { gtin, skuPrefix } = wcProductLinkMarks(product);
  return {
    id:        product.id,
    name:      product.name || null,
    sku:       product.sku || null,
    gtin:      gtin || null,
    skuPrefix: skuPrefix || null,
    status:    product.status || null,
    wpEditUrl: `${wcBaseUrl(env)}/wp-admin/post.php?post=${product.id}&action=edit`,
  };
}

// نتيجة findWcProductByShopifyId في نفس شكل wcProductSummary عشان الواجهة
// تعرض الطرفين جنب بعض في نافذة التفاصيل من غير أي شرط إضافي.
function foundProductSummary(result) {
  if (!result || !result.found) return null;
  return {
    id:         result.wp_product_id,
    name:       result.productName || null,
    sku:        result.sku || null,
    matchedBy:  result.matchedBy || null,
    matchedVia: result.matchedVia || null,
    wpEditUrl:  result.wpEditUrl || null,
  };
}

async function verifyExistingLink(env, shopifyProductId, linked) {
  assertEnv(env, 'shopify', 'woocommerce');
  const idStr     = String(shopifyProductId);
  const metaIdRaw = String(linked.wordpressId || '').trim();
  const base = {
    alreadyLinked:    true,
    wordpressId:      linked.wordpressId || null,
    productTitle:     linked.productTitle || null,
    shopifyProductId: idStr,
  };

  // كل حالات الرفض بتعمل بحث كامل (بالمسح) عشان الواجهة تعرض "المنتج الصح
  // رقمه كام" جنب المنتج المربوط غلط — الفرق ده هو كل قيمة نافذة التفاصيل.
  const rejectWithSearch = async (relinkStatus, linkedProduct) => {
    const search = await findWcProductByShopifyId(env, idStr);
    return {
      ...base,
      found:         false,
      relinkAllowed: false,
      relinkStatus,
      linkedProduct,
      searchProduct: foundProductSummary(search),
      scanned:       search.scanned ?? 0,
      scannedAll:    search.scannedAll !== false,
    };
  };

  // ① قيمة الميتافيلد نفسها لازم تكون رقم منتج صالح
  if (!/^\d+$/.test(metaIdRaw)) return rejectWithSearch('meta_invalid', null);

  // ② المنتج اللي الميتافيلد بيشاور عليه لازم يكون موجود فعلاً على ووردبريس.
  // ⚠️ نفس قاعدة v2.10.0: 404 بس معناه "اتمسح"؛ أي خطأ تاني (429 خنق · 401
  // أسرار · 5xx · شبكة) بيترفع بنصّه بدل ما يتحوّل لرسالة بتشاور على البيانات.
  let metaProduct = null;
  try {
    metaProduct = await wcGetProduct(env, metaIdRaw);
  } catch (e) {
    if (!(e instanceof WcHttpError) || e.status !== 404) throw e;
    console.error(`find_product: wcGetProduct(${metaIdRaw}) رجّع 404 — الميتافيلد بيشاور على منتج اتمسح`);
  }
  if (!metaProduct || !metaProduct.id) return rejectWithSearch('meta_missing', null);

  const marks         = wcProductLinkMarks(metaProduct);
  const linkedProduct = wcProductSummary(env, metaProduct);

  // ③/④ الإثبات: نفس قاعدة القبول في الأداة كلها — GTIN حرفي أو بداية SKU
  if (!wcProductMatchesShopifyId(metaProduct, idStr)) {
    return rejectWithSearch(
      (marks.gtin || marks.skuPrefix) ? 'cross_linked' : 'unverified',
      linkedProduct
    );
  }

  // ⑤ الإثبات موجود — بحث مستقل للتأكيد. skipScan لأن الإثبات في إيدنا أصلاً:
  // المسح هنا هيبقى لحد 30 نداء من غير أي معلومة جديدة (خنق 10-09-2026).
  const search = await findWcProductByShopifyId(env, idStr, { skipScan: true });
  if (search.found && String(search.wp_product_id) !== String(metaProduct.id)) {
    return {
      ...base,
      found:         false,
      relinkAllowed: false,
      relinkStatus:  'duplicate',
      linkedProduct,
      searchProduct: foundProductSummary(search),
      scanned:       search.scanned ?? 0,
      scannedAll:    true,
    };
  }

  return {
    ...base,
    found:           true,
    relinkAllowed:   true,
    relinkStatus:    'match',
    wp_product_id:   metaProduct.id,
    productName:     metaProduct.name,
    sku:             metaProduct.sku,
    matchedBy:       marks.gtin === idStr ? 'gtin' : 'sku',
    matchedVia:      'metafield',
    wpEditUrl:       linkedProduct.wpEditUrl,
    linkedProduct,
    searchProduct:   foundProductSummary(search),
    // البحث المستقل تأكيد إضافي مش شرط: الإثبات الحرفي على المنتج نفسه هو
    // الأساس. false هنا معناها "مالقيناهوش بالبحث" (فلتر GTIN اتعطّل مثلاً)،
    // والواجهة بتقولها للموظف في نافذة التفاصيل من غير ما توقف إعادة الربط.
    searchConfirmed: !!search.found,
  };
}

// ══════════════════════════════════════════════════════════════
// §BULK::findWcProductForRelink — v2.9.0 (أكشن find_product_relink)
// نسخة "إعادة الربط" من البحث، مخصّصة للمسار الجماعي (Bulk) في الواجهة.
//
// الفرق الوحيد عن findWcProductByShopifyId()/find_product:
//   • المنتج المربوط قبل كده **مش حالة رفض هنا — ده الوضع المتوقع**. حارس
//     "اتربط قبل كده" (checkShopifyAlreadyLinked) لسه بيتنفّذ، لكن نتيجته
//     بتُستخدم كـ**مصدر لرقم ووردبريس** بدل ما توقف العملية: قيمة
//     custom.wordpress_id هي الربط نفسه، فمفيش أي داعي ندوّر في ووكومرس تاني
//     (نداء wcGetProduct واحد بدل ما نوصل لعشرات في المسح الاحتياطي).
//   • منتج لسه مش مربوط (أو ميتافيلد بيشاور على منتج مش موجود على ووردبريس) →
//     بنرجع للبحث العادي findWcProductByShopifyId() بالظبط زي المسار الفردي.
//
// ⚠️ حارس التعارض: رقم ووردبريس من الميتافيلد **مش كفاية لوحده** — بنتأكد إن
// منتج ووكومرس ده فعلاً بيخص رقم شوبيفاي المطلوب (GTIN حرفي أو بداية SKU، نفس
// wcProductMatchesShopifyId بالظبط). لو الـ GTIN/SKU بيقول رقم شوبيفاي **تاني**،
// بنرجّع {found:false, conflict:true} من غير أي كتابة — ربط متقاطع غلط بين
// منتجين أسوأ بكتير من "مش لقيته". (GTIN فاضي وSKU من غير بادئة رقمية =
// مش تعارض — syncProduct نفسه بيتعامل مع الحالة دي بالـ fallback المعتاد.)
// ══════════════════════════════════════════════════════════════
async function findWcProductForRelink(env, shopifyProductId) {
  assertEnv(env, 'shopify', 'woocommerce');
  const idStr  = String(shopifyProductId);
  const linked = await checkShopifyAlreadyLinked(env, idStr);
  const wpIdFromMeta = String(linked.wordpressId || '').trim();

  if (linked.linked && /^\d+$/.test(wpIdFromMeta)) {
    let wooProduct = null;
    try {
      wooProduct = await wcGetProduct(env, wpIdFromMeta);
    } catch (e) {
      // ⚠️ v2.10.0 — الفرق بين "مش موجود" و"عطل" لازم يفضل واضح:
      //   • 404 بس = الميتافيلد بيشاور على منتج اتمسح فعلاً → نكمّل بالبحث العادي.
      //   • أي حاجة تانية (429 خنق · 401 أسرار · 5xx · فشل شبكة) = **عطل بنية
      //     تحتية**، بيترفع بنصّه للواجهة. بلعه هنا هو اللي خلّى 429 يظهر
      //     للموظف كـ"مفيش منتج على ووردبريس بالرقم ده" في عطل 10-09-2026 —
      //     رسالة بتشاور على البيانات والمشكلة في الاتصال.
      if (!(e instanceof WcHttpError) || e.status !== 404) throw e;
      console.error(`find_product_relink: wcGetProduct(${wpIdFromMeta}) رجّع 404 — المنتج اتمسح من ووردبريس، بنكمّل بالبحث العادي`);
    }

    if (wooProduct && wooProduct.id) {
      const gtin      = String(wooProduct.global_unique_id || '').trim();
      const skuPrefix = (String(wooProduct.sku || '').match(/^(\d{6,})-/) || [])[1] || '';
      // تعارض = فيه رقم شوبيفاي صريح على منتج ووكومرس وهو **مش** الرقم المطلوب
      const conflicting = gtin ? (gtin !== idStr) : (!!skuPrefix && skuPrefix !== idStr);
      if (conflicting) {
        return {
          found:         false,
          conflict:      true,
          alreadyLinked: true,
          wordpressId:   wooProduct.id,
          productName:   wooProduct.name,
          wcGtin:        gtin || null,
          wcSkuPrefix:   skuPrefix || null,
          productTitle:  linked.productTitle,
        };
      }
      return {
        found:         true,
        alreadyLinked: true,
        wp_product_id: wooProduct.id,
        productName:   wooProduct.name,
        sku:           wooProduct.sku,
        matchedBy:     gtin === idStr ? 'gtin' : (skuPrefix === idStr ? 'sku' : 'wordpress_id'),
        matchedVia:    'metafield',
        scanned:       0,
        scannedAll:    true,
        wpEditUrl:     `${wcBaseUrl(env)}/wp-admin/post.php?post=${wooProduct.id}&action=edit`,
        productTitle:  linked.productTitle,
      };
    }
  }

  // منتج لسه مش مربوط (أو ميتافيلد بيشاور على منتج متمسوح) — البحث العادي، لكن
  // **من غير المسح الاحتياطي** (v2.10.0): المسار الجماعي بيشتغل على منتجات
  // مربوطة، فالمسح هنا 30 نداء لكل منتج على الفاضي، وهو سبب الخنق المؤكَّد.
  const result = await findWcProductByShopifyId(env, idStr, { skipScan: true });
  return { ...result, alreadyLinked: linked.linked, productTitle: linked.productTitle };
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
          extra: { result: RESULT.SUCCESS, wpProductId, ...gtinRecoveredFromSku },
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
        extra: { result: RESULT.REJECTED, stage: 'lookup', wpProductId, shopifyProductId, vendor: shopifyVendor },
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
      extra: { result: RESULT.SUCCESS, wpProductId, shopifyProductId, ...productLevelResult },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    productLevelError = e.message;
    console.error(`Product-level sync failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `Product-level sync (metafield/status/title) failed: ${e.message}`,
      extra: { result: RESULT.ERROR, stage: 'write', wpProductId, shopifyProductId },
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
      extra: { result: RESULT.SUCCESS, wpProductId, shopifyProductId, wcStatus: 'publish', slugFixed, brandLinked: wcBrandId ? { id: wcBrandId, name: shopifyVendor } : null },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    wcProductMetaError = e.message;
    console.error(`WC product-level update (publish/meta) failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `WC product-level update (status=publish + _shopify_product_id) failed: ${e.message}`,
      extra: { result: RESULT.ERROR, stage: 'write', wpProductId, shopifyProductId },
    });
    if (!okLog) loggedOk = false;
  }

  const results = [];

  // ══════════════════════════════════════════════════════════════
  // §SYNC::variations — v2.11.0: تلات مراحل بدل لوب واحد
  //   أ) تجهيز محلي بدون أي نداء (مطابقة المقاس + حساب السعر + بناء الـ payload)
  //   ب) **نداء ووكومرس واحد لكل المقاسات** (/variations/batch) بدل نداء لكل مقاس
  //   ج) لكل مقاس: قراءة نتيجته من رد الـ batch + ميتافيلد شوبيفاي + اللوج
  //
  // ⚠️ ليه: `stylebox.online` بيحجب عند ~30 نداء (429 برد فاضي = طبقة الاستضافة
  // مش ووكومرس — راجع §CONSTANTS v2.11.0). المقاسات كانت أكبر بند في الفاتورة:
  // 5-6 نداءات من أصل ~10 لكل منتج. دلوقتي واحد.
  // الرد بيرجّع 200 حتى لو مقاس فشل — الفشل بييجي داخل عنصره (`error`)، فالعزل
  // اللي اتعمل v2.10.0 بيفضل زي ما هو بالظبط: مقاس فاشل بياخد تحذير لوحده.
  // ══════════════════════════════════════════════════════════════

  // ── (أ) تجهيز محلي — صفر نداءات ──
  const plannedVariations = [];
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
        extra: { result: RESULT.REJECTED, stage: 'lookup', wpProductId, variationId: variation.id },
      });
      if (!okLog) loggedOk = false;
      continue;
    }

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

    const shopifyVariantNumericId = numericIdFromGid(match.id);
    const payload = {
      id:                variation.id,   // مطلوب في الـ batch عشان ووكومرس تعرف أي مقاس
      sku:               match.sku,
      stock_quantity:    match.inventoryQuantity,
      manage_stock:      true,
      global_unique_id:  shopifyVariantNumericId,
      meta_data: [
        { key: '_shopify_variation_id', value: shopifyVariantNumericId },
      ],
    };
    if (priceInfo) {
      payload.regular_price = priceInfo.regularPrice;
      payload.sale_price    = priceInfo.salePrice;
    }

    plannedVariations.push({
      variation, wcSize, match, priceInfo, priceWarning, payload,
      shopifyVariantNumericId,
      stockBefore: variation.stock_quantity,
    });
  }

  // ── (ب) نداء واحد لكل المقاسات ──
  // فشل النداء نفسه (زي 429 بعد كل المحاولات) = كل المقاسات تاخد نفس التحذير،
  // والمنتج بيكمّل لخطوة التاج زي أي فشل معزول تاني.
  let batchById   = new Map();
  let batchError  = null;
  if (plannedVariations.length) {
    try {
      const batchResp = await wcBatchUpdateVariations(env, wpProductId, plannedVariations.map(p => p.payload));
      for (const row of (batchResp?.update || [])) {
        if (row && row.id !== undefined) batchById.set(Number(row.id), row);
      }
    } catch (e) {
      batchError = e.message;
      console.error(`WC batch variations update failed for ${wpProductId}:`, e);
    }
  }

  // ── (ج) لكل مقاس: نتيجته من الـ batch + ميتافيلد شوبيفاي + اللوج ──
  for (const p of plannedVariations) {
    const { variation, wcSize, match, priceInfo, shopifyVariantNumericId, stockBefore } = p;
    let priceWarning = p.priceWarning;

    const row = batchById.get(Number(variation.id));

    // فشل على مستوى المقاس ده وحده (زي product_invalid_sku) أو فشل الدفعة كلها
    // batchError جاي أصلاً من wcFetch بنص كامل فيه الـ label والـ status — مالوش
    // داعي بادئة تانية فوقه (كانت بتطلع مكرّرة مرتين في نفس السطر).
    const rowError = batchError
      ? batchError
      : !row
        ? `WC update variation ${variation.id} failed: ووكومرس ما رجّعتش نتيجة للمقاس ده في رد الـ batch`
        : row.error
          ? `WC update variation ${variation.id} failed: ${[row.error.code, row.error.message].filter(Boolean).join(' ')}` +
            (row.error.data ? ` ${JSON.stringify(row.error.data)}` : '')
          : null;

    if (rowError) {
      console.error(`Variation ${variation.id} (size ${wcSize}) sync failed: ${rowError}`);
      const okLog = await safeWriteLog(env.DB, {
        tool: TOOL_NAME, type: 'error', employee,
        sku: match.sku,
        productTitle: wooProduct.name,
        notes: `Size ${wcSize} فشل: ${rowError}`,
        extra: { result: RESULT.ERROR, stage: 'write', wpProductId, variationId: variation.id, shopifyVariantId: shopifyVariantNumericId },
      });
      if (!okLog) loggedOk = false;
      results.push({
        variationId: variation.id,
        size:    wcSize,
        status:  'warning',
        warning: rowError,
        sku:     match.sku,
      });
      continue;
    }

    // ⚠️ Step 5A-style تأكيد للسعر — HTTP 200 لوحده مش إثبات، لازم نقرا الرد
    // الفعلي (هنا: عنصر المقاس في رد الـ batch). فشل التأكيد بيبقى تحذير على
    // مستوى الـ variation، مش استثناء بيلغي التحديثات التانية.
    if (priceInfo) {
      const regularConfirmed = String(row?.regular_price ?? '') === priceInfo.regularPrice;
      const saleConfirmed    = String(row?.sale_price ?? '') === (priceInfo.salePrice || '');
      if (!regularConfirmed || !saleConfirmed) {
        priceWarning = `ووكومرس رجّعت regular_price="${row?.regular_price}" / sale_price="${row?.sale_price}" — مش مطابقة للمتوقع`;
      }
    }

    // ── Shopify variant metafield: wordpress_variation_id ──
    // ⚠️ كانت هنا بدون أي فحص نتيجة قبل الرينيم (Step 5A مخالف بالكامل) —
    // فشل الميوتيشن كان بيعدّي كـ"تم" صامت. اتصلّح 25-08-2026.
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
      // ⚠️ Step 5A ⑩②: الفشل **بعد** الفعل الأساسي = warning مش error.
      //    المقاس ده **اتكتب فعلاً على ووكومرس** (SKU/مخزون/سعر) واللي فشل هو
      //    ميتافيلد شوبيفاي بعده. تسجيله `error` بيعمل **حفرة مقفولة**: الصف
      //    بيقول فشل والمقاس متزامن، وأي تقرير بيعدّه عطل حقيقي.
      type:         'synced',
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
        result: combinedWarning ? RESULT.WARNING : RESULT.SUCCESS,
        ...(combinedWarning ? { stage: 'write' } : {}),
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
      extra: { result: RESULT.SUCCESS, wpProductId, shopifyProductId, tag: STYLEBOX_TAG },
    });
    if (!okLog) loggedOk = false;
  } catch (e) {
    tagError = e.message;
    console.error(`tagsAdd failed for ${wpProductId}:`, e);
    const okLog = await safeWriteLog(env.DB, {
      tool: TOOL_NAME, type: 'error', employee,
      notes: `Tag "${STYLEBOX_TAG}" failed: ${e.message}`,
      extra: { result: RESULT.ERROR, stage: 'write', wpProductId, shopifyProductId },
    });
    if (!okLog) loggedOk = false;
  }

  // نتيجة العملية = 3 حالات مش اتنين (Step 5A ④ / ecommoda-html-builder Step 3C)
  const slugUnconfirmed = !!(slugFixed && !slugFixed.confirmed);
  const anyVariantWarning = results.some(r => r.status === 'warning');
  const anyVariantSynced  = results.some(r => r.status === 'synced');
  // (v2.10.0) كل المقاسات اللي اتحاولت فشلت = فشل حقيقي، مش "تم جزئيًا" — قبل
  // عزل المقاسات في try/catch فوق كانت الحالة دي بترمي بره syncProduct أصلاً،
  // ومن غير الشرط ده كانت هتبقى warning حتى لو مفيش ولا مقاس واحد اتزامن.
  const allAttemptedFailed = anyVariantWarning && !anyVariantSynced;
  const overallStatus = productLevelError
    ? (anyVariantSynced ? 'warning' : 'error')
    : allAttemptedFailed
      ? 'error'
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
    // 🔴 حارس السر الغايب **قبل** المقارنة (worker-builder v3.0.0 Step 8):
    //    لو WORKER_SECRET غايب، القالب بينتج السلسلة الحرفية "Bearer undefined"
    //    — يعني أي طلب معاه الهيدر ده **بيعدّي**، والحالة اللي المفروض تكون
    //    "كل حاجة 401" بتتحوّل لـ"الحماية اتشالت" على Worker بيغيّر حالة منتجات
    //    ومخزون. الحالة مش نظرية: سر اتمسح · إضافة من غير Promote · Worker شبح.
    if (!env.WORKER_SECRET)
      return json({ error: 'Worker misconfigured: WORKER_SECRET غير مضبوط — ' +
        'ضِفه من Dashboard → Settings → Variables ثم Promote النسخة.' }, 500, request);

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
        // مش فاضي على شوبيفاي). راجع checkShopifyAlreadyLinked().
        // ⚠️ v2.13.0 — الحارس ده **مابقاش بيوقف العملية**: بقى بيسلّم لـ
        // verifyExistingLink() اللي بيتأكد إن المنتج المربوط هو نفسه المنتج
        // اللي يخص رقم شوبيفاي ده. إعادة الربط مسموحة **بس** لو الإثبات موجود
        // (relinkAllowed:true)؛ غير كده رفض بسبب مسمّى + تفاصيل الطرفين.
        const alreadyLinked = await checkShopifyAlreadyLinked(env, shopifyProductId);
        if (alreadyLinked.linked) {
          const verdict = await verifyExistingLink(env, shopifyProductId, alreadyLinked);
          return json({ ok: true, ...verdict }, 200, request);
        }
        const result = await findWcProductByShopifyId(env, shopifyProductId);
        return json({ ok: true, alreadyLinked: false, ...result }, 200, request);
      }
      // ──────────────────────────────────────────────────────────────

      // ─── §BULK — find_product_relink (v2.9.0): خطوة البحث في المسار الجماعي ──
      // قراءة بس زي find_product بالظبط (مفيش كتابة، مفيش D1 log). الفرق:
      // المنتج المربوط قبل كده هنا **هو الوضع المتوقع** مش سبب رفض — رقم
      // ووردبريس بيتاخد من custom.wordpress_id نفسه. راجع findWcProductForRelink().
      if (action === 'find_product_relink') {
        const shopifyProductId = url.searchParams.get('shopify_product_id');
        if (!shopifyProductId) return json({ error: 'shopify_product_id required' }, 400, request);
        if (!/^\d+$/.test(shopifyProductId)) {
          return json({ error: 'shopify_product_id لازم يكون رقم فقط' }, 400, request);
        }
        const result = await findWcProductForRelink(env, shopifyProductId);
        return json({ ok: true, ...result }, 200, request);
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
          // ⚠️ دي **معلومة** ℹ️ مش **نجاح** ✅ — قايمة الصلاحيات الممنوحة، مش
          //    دليل إن الصلاحية المطلوبة موجودة. الواجهة بتعرضها كقايمة بنص
          //    "الصلاحيات الممنوحة" عشان ماتدّيش طمأنينة كاذبة.
          shopifyScopes = (scopeResp?.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
        } catch (e) { shopifyError = e.message; }

        // ⚠️ كل نداء ووكومرس بيعدّي من wcFetch() (قاعدة v2.10.0) — بما فيهم
        //    ده. الفرق الوحيد `maxAttempts: 1`: التشخيص المفروض يعرض الحالة
        //    **الخام** دلوقتي، وإعادة المحاولة هنا بتخفي خنق قايم فعلاً وتخلي
        //    diag يقول "تمام" على متجر بيحجب.
        let wcOk = false, wcError = null;
        try {
          await wcFetch(env, `${wcBaseUrl(env)}/wp-json/wc/v3/products?per_page=1`,
            { label: 'diag WC probe', maxAttempts: 1 });
          wcOk = true;
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
      // get_logs — server-side filtering + pagination + sorting
      if (action === 'get_logs') {
        const p = logParamsFrom(url, TOOL_NAME);
        // 🔴 parseInt('abc') → NaN · Math.min(NaN,100) → NaN → بيوصل لـ D1 كـ
        //    bind ويرجّع خطأ غامض. الحراسة إلزامية، مش تجميل.
        const limitRaw  = parseInt(url.searchParams.get('limit')  || '100', 10);
        const offsetRaw = parseInt(url.searchParams.get('offset') || '0',   10);
        const limit  = Number.isFinite(limitRaw)  ? Math.min(Math.max(limitRaw, 1), 100) : 100;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        const sortBy  = url.searchParams.get('sortBy');
        const sortDir = url.searchParams.get('sortDir');
        const entries = await getLogs(env.DB, { ...p, limit, offset, sortBy, sortDir });
        return json({ ok: true, entries }, 200, request);
      }

      // get_logs_count — total for pagination
      if (action === 'get_logs_count') {
        const total = await getLogsCount(env.DB, logParamsFrom(url, TOOL_NAME));
        return json({ ok: true, total }, 200, request);
      }

      // get_logs_export — الصفوف **والحقيقة** مع بعض.
      // ⛔ ممنوع يرجّع entries لوحدها: getLogsExport بتقص عند LOG_EXPORT_MAX من
      //    غير أي إشارة، فالواجهة بتقول "تم تصدير N ✓" على ملف/شاشة ناقصة.
      // ⚠️ getLogsCount بيتنادى بـ**نفس الفلاتر بالظبط** — نداء بفلاتر مختلفة
      //    بيطلّع نسبة كذّابة، وهي أسوأ من مفيش رقم.
      if (action === 'get_logs_export') {
        const p = logParamsFrom(url, TOOL_NAME);
        const [entries, total] = await Promise.all([
          getLogsExport(env.DB, p),
          getLogsCount(env.DB, p),
        ]);
        return json({ ok: true, entries, cap: LOG_EXPORT_MAX, total,
                      truncated: total > LOG_EXPORT_MAX }, 200, request);
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
