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
**الإصدار:** Worker `v2.2.0` · الواجهة `v2.2.0`.

## ترتيب التنفيذ في `sync_product` (مقصود — متغيّرهوش من غير سبب)

```
1. قراءة منتج ووكومرس + الـ Variations + منتج شوبيفاي
2. Shopify product-level : status (حسب الخيار) + ⭐ (حسب الخيار) + metafield wordpress_id
3. WooCommerce product-level : status='publish' (دايمًا، بدون خيار) + meta _shopify_product_id
4. لكل Variation : SKU/مخزون/meta على ووكومرس + wordpress_variation_id على شوبيفاي
5. انتظار TAG_DELAY_MS (5 ثواني) ← ثم tagsAdd("stylebox")   ← آخر خطوة على الإطلاق
```

الخطوات 2 و3 و5 كل واحدة معزولة في `try/catch` لوحدها — فشل واحدة مايوقفش التانية.
الانتظار في الخطوة 5 مش بيستهلك CPU time في Workers، بس بيزوّد زمن استجابة
`sync_product` بـ 5 ثواني لكل تشغيلة (الواجهة بتقول ده في زرار "جاري الربط").

### GTIN fallback من الـ SKU (v2.2.0 — 26-08-2026)

في الخطوة 1، لو `global_unique_id` (خانة GTIN) فاضية على منتج ووكومرس، الـ
Worker بيدوّر على رقم شوبيفاي في **بداية** الـ `SKU` (نمط `رقم-slug`، زي
`10468835819842-skechers-slip-ins-…`، حد أدنى 6 أرقام). لو لقاه:
يكتب الرقم في `global_unique_id`، ويمسحه من الـ SKU (يفضل الباقي بس كـ SKU
جديد)، ويكمّل بقية `sync_product` عادي بنفس الرقم. لو مفيش رقم في الـ SKU
برضه، الفشل زي ما كان (`no global_unique_id ... — skipping`).
راجع `extractGtinFromSku()` في `index.js`.

## خيارات `sync_product` (v2.1.0)

| البراميتر | القيم | الافتراضي |
|---|---|---|
| `shopify_status` | `ACTIVE` · `DRAFT` · `KEEP` (ما تبعتش `status` خالص) | `DRAFT` |
| `add_star` | `true` · `false` | `true` |

> `skip_draft` / `skip_star` القديمين لسه مقبولين كـ fallback في الـ Worker
> (`skip_draft:true` ≡ `KEEP`، `skip_star:true` ≡ `add_star:false`) عشان أي واجهة
> قديمة في كاش المتصفح ماتكسرش. الواجهة الحالية مبتبعتهمش خالص.

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/StyleBox-Products-Linking/
الـ Worker : https://stylebox-products-linking-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: stylebox-products-linking-worker     ← لازم يطابق name في wrangler.toml
```

## الـ Endpoints

| `?action=` | بيعمل إيه |
|---|---|
| `sync_product` | العملية الأساسية — ربط/مزامنة منتج واحد (POST، `wp_product_id` مطلوب) |
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
- الـ Tag `stylebox` **لازم يفضل آخر خطوة** بعد انتظار الـ 5 ثواني — ده طلب صريح
  من صاحب الأداة (26-08-2026) مش تفصيلة تنفيذية. أي نقل ليه لأول العملية أو حذف
  للانتظار = مخالفة مقصودة.
- نشر المنتج على ووردبريس (`status=publish`) **بدون خيار** — بيحصل في كل تشغيلة.
  التأكيد بيتقرا من رد ووكومرس نفسه (`status === 'publish'`) مش من HTTP 200.
- كل عملية `sync_product` لازم تكون من موظف مسجّل دخول (Universal D1 Auth) —
  مفيش استثناء "تشغيل يدوي بدون تسجيل دخول" هنا رغم إن الأداة manual-only.

## استرجاع النسخ القديمة

> ده بديل الـ tags — دفع الـ tags ممنوع من جلسات Claude Code السحابية.

```
v2.0.0 → commit 3234fb1 (آخر commit قبل تعديلات 26-08-2026)
git checkout 3234fb1 -- index.js index.html
```

## مسائل مفتوحة

- تأكيد ما إذا كانت WooCommerce REST secrets (`WC_BASE_URL` / `WC_CONSUMER_KEY` /
  `WC_CONSUMER_SECRET`) لازم تتضاف كأسرار — الكود بيستخدمها فعليًا (`wcGetProduct`
  وغيرها) رغم إن الوصف الأصلي قال "Shopify OAuth بس". لو الأداة رجّعت خطأ ناقص
  متغيرات WC عند أول تشغيل حقيقي، ضيفهم في الداشبورد وحدّث هذا الملف.
