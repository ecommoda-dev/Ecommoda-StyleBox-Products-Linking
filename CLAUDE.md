# Ecommoda StyleBox Products Linking (`StyleBox-Products-Linking`)

> ⚠️ **أداة جديدة بالكامل من الصفر (مسار N — §9 في ecommoda-tool-migration-playbook)،
> مش نقل أداة موجودة من الداشبورد.** الملف `index.js` كان تاريخيًا
> `shopify-woo-sync-worker` (tool = `shopify_woo_sync`) — اتعمل عليه رينيم كامل
> + إعادة بناء شاملة مقابل `ecommoda-worker-builder` و`woocommerce-sync-helper`
> يوم 25-08-2026 (راجع تعليق §CONSTANTS في أول `index.js` لتفاصيل كل تغيير).
> الكود اتسلّم جاهزًا بالكامل من جلسة Cowork سابقة ونُقل هنا بايت ببايت من غير
> أي لمس لمنطقه.

**بتعمل إيه:** لكل منتج WooCommerce متغيّر مربوط بمنتج Shopify (الربط عبر
`global_unique_id`)، بتزامن الـ SKU/المخزون/الـ metafields لكل Variation، بتحدّث
حالة وعنوان وتاج المنتج على شوبيفاي، وبتنشر المنتج على ووردبريس (`status=publish`).
**مين بيستخدمها:** فريق ربط المنتجات (WooCommerce ↔ Shopify).
**الإصدار:** Worker `v2.4.0` · الواجهة `v2.4.0`.

## ترتيب التنفيذ في `sync_product` (مقصود — متغيّرهوش من غير سبب)

```
1. قراءة منتج ووكومرس + الـ Variations + منتج شوبيفاي
2. Shopify product-level : status (حسب الخيار) + ⭐ (حسب الخيار) + metafield wordpress_id
3. WooCommerce product-level : status='publish' (دايمًا، بدون خيار) + meta _shopify_product_id
4. لكل Variation : SKU/مخزون/meta على ووكومرس + wordpress_variation_id على شوبيفاي
5. tagsAdd("stylebox") فورًا ← آخر خطوة على الإطلاق (بدون أي انتظار)
```

الخطوات 2 و3 و5 كل واحدة معزولة في `try/catch` لوحدها — فشل واحدة مايوقفش التانية.

> تعديل 26-08-2026 (v2.2.1): الانتظار كان 5 ثواني، اتغيّر لـ 10 ثواني بناءً على طلب
> صاحب الأداة. راجع `TAG_DELAY_MS` في `index.js` (وقتها).
>
> ⚠️ تعديل 26-08-2026 (v2.4.0): الانتظار (`TAG_DELAY_MS`) **اتلغى بالكامل** —
> بطلب صريح من صاحب الأداة نفس اليوم. `tagsAdd` لسه بيتنفّذ **آخر خطوة على
> الإطلاق** زي ما هو (الترتيب نفسه ما اتغيّرش) — الملغي هو الانتظار العشر
> ثواني قبله بس. الثابت `TAG_DELAY_MS` اتشال تمامًا من `index.js`.

### GTIN fallback من الـ SKU (v2.2.0 — 26-08-2026)

في الخطوة 1، لو `global_unique_id` (خانة GTIN) فاضية على منتج ووكومرس، الـ
Worker بيدوّر على رقم شوبيفاي في **بداية** الـ `SKU` (نمط `رقم-slug`، زي
`10468835819842-skechers-slip-ins-…`، حد أدنى 6 أرقام). لو لقاه:
يكتب الرقم في `global_unique_id`، ويمسحه من الـ SKU (يفضل الباقي بس كـ SKU
جديد)، ويكمّل بقية `sync_product` عادي بنفس الرقم. لو مفيش رقم في الـ SKU
برضه، الفشل زي ما كان (`no global_unique_id ... — skipping`).
راجع `extractGtinFromSku()` في `index.js`.

## أكشن `find_product` (v2.4.0 — 26-08-2026، جديد — خطوة 1 في الواجهة)

الواجهة اتعاد تصميمها بالكامل (v2.4.0) على خطوتين: الخطوة 1 بحث، الخطوة 2 ربط
+ تحديث سعر. `find_product` هو أكشن الخطوة 1 — **قراءة بس، مفيش كتابة ومفيش D1
log** (زي `diag`/`get_config`).

```
GET ?action=find_product&shopify_product_id=10468878713154
```

- الموظف بيدخل **رقم منتج شوبيفاي الرقمي** (من رابط المنتج على أدمن شوبيفاي،
  زي `.../products/10468878713154`) — مش رقم منتج ووكومرس زي قبل كده.
- الـ Worker بيدوّر على منتج ووكومرس اللي يطابقه: إما `global_unique_id`
  (GTIN) بيساوي الرقم، أو الرقم في **بداية** الـ SKU (نفس ريجيكس
  `extractGtinFromSku`، لكن بالعكس — هنا الرقم معروف من الأول وبندوّر بيه على
  المنتج).
- **محاولتان تقنيًا**، وكل نتيجة بتتفحص فعليًا قبل القبول (مفيش تصديق أعمى):
  1. فلتر `global_unique_id` مباشر على `/wc/v3/products` — رسمي في ووكومرس
     9.2+ (نفس الحقل الظاهر في خانة "GTIN, UPC, EAN, or ISBN" في محرر
     المنتج). ⚠️ **لو الموقع على نسخة أقدم، الفلتر ده مش مضمون** — مش
     مختبَر مباشرة على `stylebox.online` من الجلسة دي (معندهاش وصول شبكة
     للموقع). راجع "مسائل مفتوحة" تحت.
  2. بحث نصي (`search=`) كـ fallback — بيغطي حالة منتج لسه مش مربوط
     (الرقم لسه في الـ SKU). ما بيغطّيش منتج **اتربط قبل كده** وGTIN بس
     مليان (السكو نضيف من الرقم) لو الفلتر (1) مش مدعوم — نفس الملحوظة فوق.
- لو لقى تطابق، بيرجّع `wp_product_id` + `productName` + `sku` + `matchedBy`
  (`gtin`/`sku`) + `wpEditUrl` (رابط صفحة تعديل المنتج جاهز، مبني من
  `WC_BASE_URL` — مفيش سر جديد مطلوب). الواجهة بتعرض زرار "🔗 عرض المنتج على
  وردبريس للمراجعة" بيه، وبتفتح الخطوة 2 (خيارات الربط + تحديث السعر)
  بالـ `wp_product_id` ده جاهز — الموظف مبقاش بيكتبه يدوي خالص.
- لو مفيش تطابق، بيرجّع `{ found: false, scanned: N }` (مش خطأ — حالة متوقعة).

راجع `findWcProductByShopifyId()`/`wcSearchProducts()` في `index.js`.

## خيارات `sync_product` (v2.1.0)

| البراميتر | القيم | الافتراضي |
|---|---|---|
| `shopify_status` | `ACTIVE` · `DRAFT` · `KEEP` (ما تبعتش `status` خالص) | `DRAFT` |
| `add_star` | `true` · `false` | `true` |

> `skip_draft` / `skip_star` القديمين لسه مقبولين كـ fallback في الـ Worker
> (`skip_draft:true` ≡ `KEEP`، `skip_star:true` ≡ `add_star:false`) عشان أي واجهة
> قديمة في كاش المتصفح ماتكسرش. الواجهة الحالية مبتبعتهمش خالص.

## أكشن `update_price` (v2.3.0 — 26-08-2026، جديد)

أكشن **منفصل تمامًا** عن `sync_product` — مفيش انتظار الـ 10 ثواني هنا، وبيتشغّل
من بطاقة "💰 تحديث السعر" الخاصة بيه في نفس تاب "ربط منتج".

```
POST ?action=update_price
body: { wp_product_id, price_difference, employee }
```

- `price_difference` رقم **مطلوب** (يقبل سالب أيضًا) — بييجي من حقل في الواجهة
  مباشرة، **مش** `env var` زي `PRICE_DIFFERENCE` في أداة "مزامنة أسعار
  Stylebox". القيمة بتتحفظ في `localStorage` (`stylebox_link_price_difference`)
  كآخر قيمة استُخدمت **للراحة بس** — مفيش قيمة افتراضية مبيّتة في الكود، ومفيش
  إرسال تلقائي من غير ما المستخدم يضغط الزرار.
- **المنتج لازم يكون اتربط الأول** (`global_unique_id` موجود على ووكومرس) —
  لو لسه مش مربوط، الأكشن بيرفض برسالة توجّه لتشغيل "تشغيل الربط" الأول.
  مفيش GTIN-from-SKU fallback هنا (ده بتاع `sync_product` بس).
- **المطابقة بالمقاس** — نفس آلية `sync_product` (`findWcSize`/
  `findShopifyVariantBySize`)، **مش** `wordpress_variation_id`/GTIN triple-check
  بتاع أداة "مزامنة أسعار Stylebox" (الأداة دي مالهاش الـ custom WP endpoint
  ولا `SYNC_SECRET` بتاعها — الكتابة هنا مباشرة عبر `wc/v3` بنفس أسرار WC
  المستخدمة في `wcUpdateVariation`).
- **معادلة الحساب** (نفس معادلة `stylebox-price-sync-worker` حرفيًا —
  `computeVariantPrices()`): لو فيه خصم فعلي على شوبيفاي
  (`compareAtPrice > price`) → `regular_price = compare_at + diff` و
  `sale_price = price + diff`. وإلا → `regular_price = price + diff` و
  `sale_price` بيتفضّى (بيمسح أي خصم قديم على ووكومرس).
- **D1:** بيستخدم نفس `type = 'synced'` (نجاح) / `'error'` (فشل) المسجّلين
  أصلًا للأداة دي في `ecommoda-constants` §7 — **مش** `type` جديد، لأن الجلسة
  اللي بنت الميزة دي معندهاش صلاحية تعدّل ريبو المهارات. المُميِّز هو
  `extra.operation = 'price_update'`. لو محتاج فلترة منفصلة في تاب السجل
  مستقبلًا (بدل البحث النصي)، سجّل `type` مخصّص (مثلاً `price_synced`) في
  `ecommoda-constants` §7 **الأول** قبل أي تعديل تاني.

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/StyleBox-Products-Linking/
الـ Worker : https://stylebox-products-linking-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: stylebox-products-linking-worker     ← لازم يطابق name في wrangler.toml
```

## الـ Endpoints

| `?action=` | بيعمل إيه |
|---|---|
| `find_product` | البحث بمعرف شوبيفاي (v2.4.0) — خطوة 1، GET، قراءة بس (`shopify_product_id` مطلوب) — راجع القسم فوق |
| `sync_product` | العملية الأساسية — ربط/مزامنة منتج واحد (POST، `wp_product_id` مطلوب) |
| `update_price` | تحديث السعر (v2.3.0) — أكشن منفصل (POST، `wp_product_id` + `price_difference` مطلوبان) — راجع القسم فوق |
| `check_employee` / `register_pin` / `verify_employee` / `log_logout` / `get_employees` | Universal D1 Auth |
| `diag` | تشخيص env/Shopify/WC/D1 |
| `get_config` | نسخة الـ Worker |
| `get_logs` / `get_logs_count` / `get_logs_export` | سجل العمليات |

## D1

```
tool  : stylebox_products_linking
type  : product_meta_synced · synced · error · login · logout
```

> لو القيم دي مش في جدول D1 في `ecommoda-constants` §7 → ضيفها هناك الأول.

> ⚠️ **`update_price` (v2.3.0) بيستخدم نفس `type = 'synced'`/`'error'` فوق —
> مفيش `type` جديد.** المُميِّز `extra.operation = 'price_update'` جوه كل صف.
> قرار مقصود (مش سهو): الجلسة اللي بنت الميزة دي معندهاش وصول لريبو
> `ecommoda-constants` عشان تسجّل `type` جديد فيه قبل أول استخدام (Rule 7).
> لو محتاج فلترة منفصلة لعمليات تحديث السعر في تاب السجل مستقبلًا، سجّل
> `type` مخصّص (مثلاً `price_synced`) هناك **الأول** قبل أي تعديل تاني.

## المضبوط فعليًا في الداشبورد

> اللي **متظبط بالفعل** — مش اللي المفروض يكون.

```
Bindings : DB → ecommoda-dev-logs
Secrets  : WORKER_SECRET · CLIENT_ID · CLIENT_SECRET   ← Shopify OAuth بس
           (الأداة دي مبتكلّمش WooCommerce REST مباشرة عبر أسرار WC — راجع index.js
            لو WC_BASE_URL/WC_CONSUMER_KEY/WC_CONSUMER_SECRET اتفعّلوا فعليًا)
Vars     : SHOP_DOMAIN   ← من [vars] في wrangler.toml. مفيش LOCATION_ID (مش أداة مخزون)
Build watch paths : * الافتراضي
```

## CORS

`ALLOWED_ORIGINS` صارمة (`https://ecommoda-dev.github.io` فقط) — Option B، لأن
الأداة **كتابة**: بتغيّر حالة/عنوان/تاج المنتج على شوبيفاي ومخزون/SKU على WooCommerce.

## خط الأساس بعد النقل

> الأرقام اللي الأداة رجّعتها بعد ما اتأكدنا إنها شغالة — مرجع لأي شك بعد كده.

```
لسه محتاج تسجيل بعد أول اختبار حقيقي بعد الربط في Cloudflare.
```

## فخاخ الأداة دي

- الأداة دي **manual-only بالتصميم** — مفيش `scheduled()` ومفيش `sync_all`. أي
  إضافة Cron أو دفعة تشغيل جماعي = مخالفة مقصودة، راجع تعليق §CONSTANTS في
  `index.js` قبل ما تضيفها.
- `shopify_status` و`add_star` خياران **مستقلّان تمامًا** عن بعض — قيمة واحد
  مالهاش أي أثر على التاني. لا تدمجهم في خيار واحد.
- الـ Tag `stylebox` **لازم يفضل آخر خطوة** في `syncProduct` — ده طلب صريح من
  صاحب الأداة مش تفصيلة تنفيذية. أي نقل ليه لأول العملية = مخالفة مقصودة.
  ⚠️ **الانتظار العشر ثواني اللي كان قبله (`TAG_DELAY_MS`) اتلغى بالكامل
  v2.4.0** — القاعدة القديمة ("الحذف للانتظار = مخالفة") اتقلبت: صاحب الأداة
  نفسه طلب الإلغاء 26-08-2026. لو رجّعت الانتظار من غير طلب صريح جديد، ده
  اللي بقى مخالفة دلوقتي.
- الواجهة (v2.4.0) بقت **خطوتين إلزاميتين**: البحث بمعرف شوبيفاي (`find_product`)
  الأول، وبعده الربط/تحديث السعر — مفيش إدخال يدوي لـ WooCommerce Product ID
  خالص، لازم يجي من نتيجة البحث. أي رجوع لإدخال يدوي بدون البحث = مخالفة
  مقصودة لهذا التصميم.
- نشر المنتج على ووردبريس (`status=publish`) **بدون خيار** — بيحصل في كل تشغيلة.
  التأكيد بيتقرا من رد ووكومرس نفسه (`status === 'publish'`) مش من HTTP 200.
- كل عملية `sync_product` لازم تكون من موظف مسجّل دخول (Universal D1 Auth) —
  مفيش استثناء "تشغيل يدوي بدون تسجيل دخول" هنا رغم إن الأداة manual-only.
- `update_price` (v2.3.0) **مايشتغلش لو المنتج مش مربوط بعد** — لازم
  `sync_product` يتشغّل الأول (أو أي تشغيلة سابقة كتبت `global_unique_id`).
  مفيش GTIN-from-SKU fallback في `update_price` — القرار ده مقصود، مش نسيان.
- فرق السعر (`price_difference`) بيتحفظ في `localStorage` **للراحة بس** (آخر
  قيمة استُخدمت) — مفيش قيمة افتراضية صامتة في الكود، ولازم المستخدم يدخلها
  ويضغط الزرار في كل مرة. لو حد غيّر القيمة في الحقل ونسي، مفيش هامش "افتراضي"
  بيتطبّق بدل منها زي `getPriceDiff()` في أداة الأسعار التانية.

## استرجاع النسخ القديمة

> ده بديل الـ tags — دفع الـ tags ممنوع من جلسات Claude Code السحابية.

```
v2.0.0 → commit 3234fb1 (آخر commit قبل تعديلات 26-08-2026)
git checkout 3234fb1 -- index.js index.html
```

## بصمة المهارات

> الصيغة والقواعد والمهارات اللي بتدخل الجدول → `ecommoda-skill-versioning`
> Step 4. مهارة مالهاش رقم إصدار مابتدخلش الجدول.

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v1.0.0 |
| ecommoda-html-builder | v1.0.0 |
| woocommerce-sync-helper | v1.0.0 |

آخر مطابقة: 26-08-2026 · `index.js` v2.4.0 · `index.html` v2.4.0
🔴 معلّقة: — لا شيء

> سطر **🔴 معلّقة** = أي بند كاسر **معروف ومتقرر تأجيله**، بسببه.
> `— لا شيء` معناها مفيش. **بند 🔴 متأجل من غير ما يتكتب هنا = بند ضايع** —
> مفيش ملف تاني في المشروع بيتتبّعه.

## مسائل مفتوحة

- تأكيد ما إذا كانت WooCommerce REST secrets (`WC_BASE_URL` / `WC_CONSUMER_KEY` /
  `WC_CONSUMER_SECRET`) لازم تتضاف كأسرار — الكود بيستخدمها فعليًا (`wcGetProduct`
  وغيرها) رغم إن الوصف الأصلي قال "Shopify OAuth بس". لو الأداة رجّعت خطأ ناقص
  متغيرات WC عند أول تشغيل حقيقي، ضيفهم في الداشبورد وحدّث هذا الملف. **`update_price`
  (v2.3.0) بيستخدم نفس الأسرار دي** (`wcGetProduct`/`wcUpdateVariation`) — لو
  البند ده لسه مفتوح، `update_price` هيفشل بنفس السبب اللي `sync_product` ممكن
  يفشل بيه.
- تسجيل `type` مخصّص لعمليات `update_price` في `ecommoda-constants` §7 (بدل
  إعادة استخدام `synced`/`error` مع `extra.operation`) — اختياري، مش إلزامي
  دلوقتي. يستاهل لو محتاجين فلترة/تقرير منفصل لعمليات تحديث السعر في تاب السجل.
- **تأكيد إن فلتر `global_unique_id` على `/wc/v3/products` فعليًا مدعوم على
  `stylebox.online`** — الكود (`find_product`، v2.4.0) بيجرّبه كمحاولة أولى
  مع بحث نصي (`search=`) كـ fallback، لكن الجلسة اللي بنت الميزة دي معندهاش
  وصول شبكة للموقع عشان تختبره مباشرة. لو نسخة ووكومرس أقدم من 9.2 (أو
  الفلتر مش شغّال لأي سبب)، البحث هيفضل شغّال بس هيعتمد بالكامل على
  الـ fallback النصي — واللي مش هيلاقي منتج **اتربط قبل كده** (GTIN موجود
  بس الرقم اتشال من الـ SKU زمان). لو حد جرّب البحث على منتج متربط قديم
  ورجع "مفيش تطابق" رغم إنه فعلاً مربوط، ده أول مكان تتأكد منه.
