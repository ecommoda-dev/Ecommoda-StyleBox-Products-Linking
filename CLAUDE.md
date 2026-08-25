# Ecommoda StyleBox Products Linking (`StyleBox-Products-Linking`)

> ⚠️ **أداة جديدة بالكامل من الصفر (مسار N — §9 في ecommoda-tool-migration-playbook)،
> مش نقل أداة موجودة من الداشبورد.** الملف `index.js` كان تاريخيًا
> `shopify-woo-sync-worker` (tool = `shopify_woo_sync`) — اتعمل عليه رينيم كامل
> + إعادة بناء شاملة مقابل `ecommoda-worker-builder` و`woocommerce-sync-helper`
> يوم 25-08-2026 (راجع تعليق §CONSTANTS في أول `index.js` لتفاصيل كل تغيير).
> الكود اتسلّم جاهزًا بالكامل من جلسة Cowork سابقة ونُقل هنا بايت ببايت من غير
> أي لمس لمنطقه.

**بتعمل إيه:** لكل منتج WooCommerce متغيّر مربوط بمنتج Shopify (الربط عبر
`global_unique_id`)، بتزامن الـ SKU/المخزون/الـ metafields لكل Variation، وبتحدّث
حالة وعنوان وتاج المنتج على شوبيفاي.
**مين بيستخدمها:** فريق ربط المنتجات (WooCommerce ↔ Shopify).
**الإصدار:** Worker `v2.0.0` · الواجهة (بدون رقم إصدار ظاهر في الهيدر — راجع الملف).

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
- `skip_draft` و`skip_star` خياران **مستقلّان تمامًا** عن بعض — تفعيل واحد
  مايأثرش على التاني. لا تدمجهم في خيار واحد تاني.
- كل عملية `sync_product` لازم تكون من موظف مسجّل دخول (Universal D1 Auth) —
  مفيش استثناء "تشغيل يدوي بدون تسجيل دخول" هنا رغم إن الأداة manual-only.

## استرجاع النسخ القديمة

> ده بديل الـ tags — دفع الـ tags ممنوع من جلسات Claude Code السحابية.

```
مفيش نسخ قديمة — أداة جديدة، أول commit هو نقطة البداية.
```

## مسائل مفتوحة

- تأكيد ما إذا كانت WooCommerce REST secrets (`WC_BASE_URL` / `WC_CONSUMER_KEY` /
  `WC_CONSUMER_SECRET`) لازم تتضاف كأسرار — الكود بيستخدمها فعليًا (`wcGetProduct`
  وغيرها) رغم إن الوصف الأصلي قال "Shopify OAuth بس". لو الأداة رجّعت خطأ ناقص
  متغيرات WC عند أول تشغيل حقيقي، ضيفهم في الداشبورد وحدّث هذا الملف.
