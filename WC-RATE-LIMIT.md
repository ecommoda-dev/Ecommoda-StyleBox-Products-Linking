# حجب `stylebox.online` للأداة (429) — دليل الحل مع الاستضافة

> **الملف ده لمين:** لصاحب الأداة عشان يبعته لدعم الاستضافة أو لمسؤول السيرفر،
> وللجلسات الجاية اللي هتشتغل على نفس المشكلة.
> **تاريخ التحرير:** 10-09-2026 · مقابل Worker `v2.11.0` / واجهة `v2.15.0`.
> **الحالة:** ⚠️ **مفتوح** — الأداة اتظبطت لتقليل الأثر، لكن الحد نفسه لسه موجود
> وحلّه بيد الاستضافة. راجع "مسائل مفتوحة" في `CLAUDE.md`.

---

## 0) الخلاصة في 30 ثانية

أداة ربط المنتجات (Cloudflare Worker) بتنادي WooCommerce REST على
`stylebox.online`. بعد حوالي **30 نداء**، السيرفر بيبدأ يرفض كل النداءات
بـ **`429 Too Many Requests`** لمدة **أطول من 15 ثانية**.

**المطلوب من الاستضافة — واحد من التلاتة (مرتّبين بالأفضل):**

| # | الحل | ليه |
|---|---|---|
| **A** | **استثناء بهيدر سري** (`X-EcomModa-Client`) من قواعد الـ rate limit | ✅ الأدق والأأمن — بيستثني أداتنا بس |
| **B** | **رفع حد الـ requests** لنطاقات Cloudflare أو للمسار `/wp-json/wc/v3/*` | ✅ مقبول لو A مش متاح |
| **C** | **allowlist لنطاقات Cloudflare بالـ IP** | ⚠️ يشتغل، بس بيفتح لأي Worker على الإنترنت — لازم يتجمع مع المصادقة |

**اللي مش مطلوب ومرفوض:** تعطيل الـ WAF/الحماية كلها، أو فتح `/wp-json` للعامة.

---

## 1) الدليل — الحجب **مش** من ووكومرس ولا من ووردبريس

ده مهم لأنه بيحدد **مين** بيصلح المشكلة. الدليل قاطع:

### أ) رد الـ 429 **فاضي تمامًا** (مفيش body)

الأداة بتلزق نص رد ووكومرس في رسالة الخطأ لو موجود. في نفس التشغيلة:

```
✅ خطأ من ووكومرس فعلاً (400) — رد فيه JSON:
   WC update variation 20769 failed: 400 {"code":"product_invalid_sku",
   "message":"Invalid or duplicated SKU.","data":{"status":400,
   "resource_id":16077,"unique_sku":"NF1 / Black x Orange / 45-1"}}

❌ الـ 429 — رد فاضي بالكامل:
   WC get product 20758 failed: 429
```

**WordPress/WooCommerce بيرجّعوا JSON دايمًا** (`code` + `message`) في كل خطأ.
رد فاضي معناه إن الطلب **اترفض قبل ما يوصل لـ PHP أصلاً** — يعني طبقة قبل
ووردبريس: سيرفر الويب، أو WAF، أو بروكسي/CDN.

### ب) الحد ثابت ومتكرّر

| التشغيلة | اتحجبت عند | تقدير النداءات قبل الحجب |
|---|---|---|
| الأولى (15 منتج) | المنتج رقم **4** | ~30 |
| إعادة المحاولة (8 منتجات) | المنتج رقم **4** | ~31 |

### ج) النافذة أطول من 15 ثانية

الأداة بتعيد المحاولة 3 مرات بباكوف (800ms → 3200ms) وبعدين بتستنى 15 ثانية
كاملة — **وبرضه المنتج اللي بعده بيترفض بـ429**. يعني مدة الحظر أطول من كده
بكتير (دقيقة أو أكتر على الأرجح).

---

## 2) بيانات الأداة — الاستضافة هتطلبها

| البند | القيمة |
|---|---|
| **الموقع المستهدف** | `https://stylebox.online` |
| **المسارات** | `/wp-json/wc/v3/products/{id}` · `/wp-json/wc/v3/products/{id}/variations` · `/wp-json/wc/v3/products/{id}/variations/batch` · `/wp-json/wc/v3/products/brands` |
| **الميثودز** | `GET` و`PUT` و`POST` |
| **المصادقة** | `Authorization: Basic <consumer_key:consumer_secret>` — مفاتيح WooCommerce REST رسمية |
| **مصدر الطلبات** | **Cloudflare Workers** (`stylebox-products-linking-worker.ecommoda-dev.workers.dev`) — نطاقات Cloudflare، مش IP ثابت واحد |
| **معدّل الطلبات** | **5-6 نداءات لكل منتج**، والمنتجات بالتتابع (منتج واحد في المرة) بفاصل 700ms بينهم |
| **أقصى حِمل متوقع** | قائمة 20 منتج ≈ **110 نداء** موزّعة على ~3-4 دقايق |
| **الطبيعة** | تشغيل **يدوي** من موظف — مفيش Cron ومفيش تشغيل تلقائي خالص |
| **الهيدرز المُرسَلة حاليًا** | `Authorization` فقط (+ `Content-Type` في الكتابة). **مفيش User-Agent ولا هيدر تعريفي** — راجع §3 |

> **نقطة مهمة للدعم:** ده **مش** هجوم ولا سكريبت عشوائي — عدد الطلبات صغير
> جدًا (~110 طلب في 4 دقايق كحد أقصى)، وكلها موثّقة بمفاتيح REST رسمية،
> وبتيجي من موظف واحد بيضغط زرار.

---

## 3) الحل A (الأفضل) — استثناء بهيدر سري بدل IP

**الفكرة:** الأداة تبعت هيدر سري مع كل نداء، والاستضافة تستثني الطلبات اللي
شايلة الهيدر ده من قواعد الـ rate limit. أدق من الـ IP (بيستثني أداتنا بس مش
أي حد على Cloudflare) وأسهل في الإدارة (مفيش قوائم IP بتتغير).

### ⚠️ خطوة مطلوبة من ناحيتنا الأول

الأداة **دلوقتي مبتبعتش أي هيدر تعريفي** — `Authorization` بس. عشان الحل ده
يشتغل، لازم نضيف في `wcFetch()` في `index.js`:

```javascript
const headers = {
  Authorization: wcAuthHeader(env),
  'User-Agent':        'EcomModa-StyleBox-Linking-Worker/2.11.0',
  'X-EcomModa-Client': env.WC_ALLOWLIST_TOKEN,   // سر جديد في الداشبورد
};
```

> **تنبيه:** التعديل ده **لسه ماتعملش** — محتاج طلب صريح. لو الاستضافة وافقت
> على الطريقة دي، قول وهيتعمل في تعديل صغير (+ إضافة السر `WC_ALLOWLIST_TOKEN`
> في Cloudflare Dashboard وPromote).

### أمثلة القاعدة حسب الطبقة

**لو الحجب من Cloudflare (لو `stylebox.online` نفسه على Cloudflare):**
Security → WAF → Rate limiting rules → القاعدة الموجودة → **Skip / Bypass** لما:
```
http.request.headers["x-ecommoda-client"][0] eq "<TOKEN>"
```

**لو من ModSecurity / imunify360:** استثناء بقاعدة `SecRule` على الهيدر:
```apache
SecRule REQUEST_HEADERS:X-EcomModa-Client "@streq <TOKEN>" \
  "id:1000001,phase:1,pass,nolog,ctl:ruleEngine=Off"
```

**لو من Wordfence:** الهيدر مش كافي هنا — Wordfence بيستثني بالـ IP بس
(Wordfence → Firewall → All Firewall Options → **Allowlisted IP addresses**)،
فالحل C هو المناسب مع Wordfence.

---

## 4) الحل B — رفع حد الـ requests

أبسط طلب ممكن تبعته للدعم:

> ارفعوا حد الـ requests للمسار `/wp-json/wc/v3/*` لـ **200 طلب في الدقيقة**
> على الأقل (الحالي حوالي 30)، أو استثنوا المسار ده من الـ rate limiting مع
> إبقاء المصادقة شغّالة.

**الأماكن اللي الحد ممكن يكون فيها** (الدعم هو اللي يحدد أنهي واحدة):

| الطبقة | المكان |
|---|---|
| **LiteSpeed Web Server** | Per Client Throttling → Dynamic Requests/Second · Soft/Hard limits |
| **nginx** | `limit_req_zone` / `limit_req` (والـ 429 بييجي من `limit_req_status 429`) |
| **Cloudflare** (لو الموقع عليه) | Security → WAF → Rate limiting rules |
| **imunify360 / ModSecurity** | قواعد الـ rate limit أو الـ bruteforce protection |
| **CloudLinux LVE** | حدود الحساب (EP / concurrent connections) |
| **پلجن ووردبريس** | Wordfence Rate Limiting · أي پلجن REST throttling |

> ⚠️ لو الحد من **پلجن ووردبريس**، الرد كان هيبقى JSON مش فاضي — فالأرجح إنه
> من الطبقات اللي فوق ووردبريس. لكن سيبها للدعم يتأكد.

---

## 5) الحل C — allowlist بنطاقات Cloudflare (IP)

### القوائم الرسمية

```
IPv4 : https://www.cloudflare.com/ips-v4
IPv6 : https://www.cloudflare.com/ips-v6
JSON : https://api.cloudflare.com/client/v4/ips
```

نداءات Cloudflare Workers بتخرج من نفس نطاقات Cloudflare دي.

### ⚠️ تحذيران لازم يتقالوا للدعم

1. **مفيش IP واحد ثابت.** لازم النطاقات كلها (حوالي 15 نطاق IPv4 + 7 IPv6)،
   ومحدش يقدر يضيّقها لـ IP واحد.
2. **allowlist لنطاقات Cloudflare = allowlist لأي Worker على الإنترنت** — أي حد
   يقدر يشغّل Worker مجاني ويخرج من نفس النطاقات. **فالقاعدة دي لازم تتجمع مع
   المصادقة (مفاتيح WooCommerce REST) وميتشالش الـ auth أبدًا.** الاستثناء
   المطلوب هو **من الـ rate limiting بس** — مش من المصادقة ولا من الحماية.

### أمثلة

**Wordfence:** Firewall → All Firewall Options → Allowlisted IP addresses →
الصق النطاقات (بيقبل CIDR).

**`.htaccess` (Apache/LiteSpeed) — استثناء من قاعدة موجودة:**
```apache
# مثال — يتظبط حسب القاعدة الفعلية عند الاستضافة
<If "%{HTTP_HOST} == 'stylebox.online'">
  # السماح لنطاقات Cloudflare بتخطّي حد الطلبات على WC REST فقط
</If>
```
> الصيغة الفعلية بتختلف حسب الموديول اللي بيعمل الحجب — **سيب الدعم يكتبها**،
> المهم إنك تديله النطاقات والمسار.

**قاعدة تحديث:** نطاقات Cloudflare بتتغير من وقت للتاني — يتحطّ تذكير مراجعة
كل 6 شهور، أو يتسحب تلقائي من `https://api.cloudflare.com/client/v4/ips`.

---

## 6) إزاي نعرف الطبقة اللي بتحجب بالظبط

الدعم غالبًا هيسأل "منين الحجب؟" — دي الطرق اللي بتجاوب:

### أ) هيدرز رد الـ 429 (الأسرع والأدق)

الهيدرز بتقول مين رفض. من أي جهاز (مش من الأداة):

```bash
# شغّل ده 40 مرة بسرعة لحد ما ييجي 429، وشوف الهيدرز
for i in $(seq 1 40); do
  curl -s -o /dev/null -D - \
    -u "CONSUMER_KEY:CONSUMER_SECRET" \
    "https://stylebox.online/wp-json/wc/v3/products?per_page=1" \
    | grep -iE "^(HTTP/|server|retry-after|cf-ray|x-powered-by|x-litespeed|x-sucuri)"
  echo "--- $i"
done
```

| اللي تشوفه في رد الـ 429 | يعني |
|---|---|
| `cf-ray:` موجود | الموقع خلف Cloudflare — الحجب غالبًا من قواعد Cloudflare |
| `server: LiteSpeed` | LiteSpeed Web Server — throttling على مستوى السيرفر |
| `server: nginx` | `limit_req` على nginx |
| `retry-after: N` | **المدة المطلوبة بالثواني** — الأداة بتحترمها تلقائيًا من v2.11.0 |
| مفيش أي هيدر مميّز | اسأل الدعم مباشرةً عن قواعد الـ rate limit على الحساب |

### ب) اطلب من الدعم سطر اللوج

ابعتلهم **الوقت بالظبط** لتشغيلة فشلت، واطلب:
> عايزين سطر اللوج بتاع الطلبات اللي اترفضت بـ429 على `/wp-json/wc/v3/` في
> الوقت ده، وأي قاعدة rate limit مطبّقة على الحساب.

### ج) تحديد الحد بالظبط

السكربت اللي فوق بيقول **عند أي رقم** بدأ الرفض — ده رقم مفيد جدًا للدعم
("بيحجب عند الطلب رقم N في X ثانية").

---

## 7) رسالة جاهزة للدعم

### النسخة العربية

> السلام عليكم،
>
> عندنا أداة داخلية بتنادي WooCommerce REST API على موقعنا `stylebox.online`
> بمفاتيح REST رسمية. بعد حوالي **30 طلب**، السيرفر بيبدأ يرفض كل الطلبات
> بـ `429 Too Many Requests` **برد فاضي بدون body** — وده معناه إن الرفض
> بيحصل قبل ووردبريس، من طبقة السيرفر أو الحماية مش من ووكومرس.
>
> تفاصيل الطلبات:
> - المسارات: `/wp-json/wc/v3/products*`
> - المصادقة: WooCommerce REST API keys (Basic Auth)
> - المصدر: Cloudflare Workers (نطاقات Cloudflare — مش IP ثابت)
> - المعدّل: 5-6 طلبات لكل منتج، والمنتجات بالتتابع بفاصل 0.7 ثانية
> - أقصى حِمل: ~110 طلب موزّعة على 3-4 دقايق، وبتشغيل يدوي من موظف واحد
>
> المطلوب — أي واحد من دول:
> 1. استثناء الطلبات اللي شايلة هيدر `X-EcomModa-Client` بقيمة سرية نتفق عليها،
>    من قواعد الـ rate limit.
> 2. أو رفع حد الطلبات على المسار `/wp-json/wc/v3/*` لـ 200 طلب/دقيقة على الأقل.
> 3. أو عمل allowlist لنطاقات Cloudflare الرسمية (`https://www.cloudflare.com/ips-v4`
>    و`ips-v6`) **من قواعد الـ rate limit فقط** — مع إبقاء المصادقة والحماية شغّالة زي ما هي.
>
> ولو ممكن، عايزين نعرف: أي طبقة بالظبط بتعمل الحجب، وإيه الحد الحالي ومدة
> الحظر؟
>
> شكرًا.

### English version

> Hello,
>
> We run an internal tool that calls the WooCommerce REST API on our site
> `stylebox.online` using official REST API keys. After roughly **30 requests**,
> the server starts rejecting every request with `429 Too Many Requests` and an
> **empty response body** — which indicates the rejection happens before
> WordPress/PHP (server or security layer), not from WooCommerce itself.
>
> Request details:
> - Paths: `/wp-json/wc/v3/products*`
> - Auth: WooCommerce REST API keys (Basic Auth)
> - Source: Cloudflare Workers (Cloudflare IP ranges — not a single static IP)
> - Rate: 5-6 requests per product, products processed sequentially with a
>   0.7s gap
> - Peak load: ~110 requests spread over 3-4 minutes, triggered manually by a
>   single staff member
>
> We'd like any one of the following:
> 1. Exempt requests carrying an `X-EcomModa-Client` header (secret value we
>    agree on) from your rate limiting rules.
> 2. Or raise the request limit on `/wp-json/wc/v3/*` to at least 200 requests
>    per minute.
> 3. Or allowlist the official Cloudflare IP ranges
>    (`https://www.cloudflare.com/ips-v4` and `ips-v6`) **for rate limiting
>    only** — authentication and other protections should stay in place.
>
> Could you also tell us which layer is doing the blocking, the current limit,
> and the block duration?
>
> Thanks.

---

## 8) لو الاستضافة رفضت — الخطة البديلة (شغل على ووردبريس)

**Custom WP endpoint** يعمل كل شغل المنتج في **نداء واحد** بدل 5-6.

- نفس النمط الموجود فعلاً في الستاك: `ecommoda/v1/variation-stock/{id}`
  محمي بهيدر `X-EcomModa-Secret` (راجع `woocommerce-sync-helper` Step 3).
- endpoint جديد زي `ecommoda/v1/link-product` ياخد كل بيانات المنتج والمقاسات
  مرة واحدة، ويعمل التحديثات جوّه ووردبريس نفسه.
- **النتيجة:** نداء واحد لكل منتج → قائمة 20 منتج = 20 نداء بدل 110، يعني
  **تحت الحد الحالي من غير ما الاستضافة تعمل أي حاجة**.
- ⚠️ **بس** ده محتاج شغل على جهة ووردبريس (كتابة الـ plugin/endpoint، والالتزام
  بقواعد HPOS في `woocommerce-sync-helper` Step 4).

البند ده مسجّل أصلاً في "مسائل مفتوحة" في `CLAUDE.md`.

---

## 9) اللي **ماينفعش** يتعمل

- ❌ **تعطيل الـ WAF أو الحماية كلها** عشان الأداة تشتغل.
- ❌ **فتح `/wp-json` للعامة بدون مصادقة.**
- ❌ **allowlist بالـ IP لوحده من غير مصادقة** — نطاقات Cloudflare مشتركة مع
  العالم كله (راجع §5).
- ❌ **تعطيل الـ retry/الباكوف في الأداة** عشان "تخلص أسرع" — ده بيرجّع العطل
  الأصلي (راجع فخاخ v2.10.0 في `CLAUDE.md`).

---

## 10) ملحق — أرقام الأداة (للمرجع)

| | قبل v2.10.0 | v2.10.0 | v2.11.0 (الحالي) |
|---|---|---|---|
| نداءات ووكومرس لكل منتج | 10-11 | 10-11 | **6** (و**5** بعد أول منتج) |
| retry على 429 | ❌ مفيش | ✅ 3 محاولات بباكوف | ✅ + احترام `Retry-After` |
| المسح الاحتياطي في Bulk | 30 نداء لكل فشل | ❌ اتقفل | ❌ مقفول |
| الوقفة بعد الخنق | ❌ مفيش | 15s ثابتة | **15→30→60→90s** تصاعدية |
| منتجات قبل الحجب (~30 نداء) | ~3 | ~3 | **~6** |

**التقليل ده وصل لأقصاه من ناحية الأداة** — الباقي مقسّم بين:
1. الاستضافة (§3-§5)، أو
2. custom WP endpoint (§8).
