<?php
/**
 * EcomModa — StyleBox Link Product API
 * -----------------------------------------------------------------
 * غرض هذا الـ snippet: يفتح 3 endpoints جديدة تحت namespace ecommoda/v1
 * منفصلة تمامًا عن أي snippet تاني (زي variation-stock / variation-price)،
 * بيستخدمها stylebox-products-linking-worker عشان يعمل شغل ربط المنتج كله
 * (publish + slug fix + meta + Brand + الكاتيجوريز + كل الـ Variations) في
 * 2-3 نداءات بدل 5-6 نداءات لـ /wc/v3/* منفصلة — راجع §8 في CLAUDE.md بتاع
 * الأداة دي (Ecommoda-StyleBox-Products-Linking) للتفاصيل الكاملة.
 *
 * 1) GET  /wp-json/ecommoda/v1/link-product/{id}
 *    → يرجع المنتج (id/name/slug/sku/gtin/status) + كل الـ Variations
 *      (id/sku/stock_quantity/gtin/attributes) في نداء واحد
 *
 * 2) GET  /wp-json/ecommoda/v1/check-brand?vendor_name=...&product_type=...
 *    → حارس ما-قبل-الكتابة الموحّد (مستقل عن أي منتج): بيرجّع البراند
 *      (تاكسونومي product_brand) + **تلات كاتيجوريز** (تاكسونومي product_cat):
 *      كاتيجوري باسم البراند · كاتيجوري الـ Type تحت Footwear · all-products.
 *      أي واحدة فيهم مش موجودة بترجع null والـ Worker بيوقف الربط بالكامل.
 *      لازم يتنادى **قبل** أي كتابة على شوبيفاي أو ووكومرس (حارس البراند
 *      v2.6.0 + حرّاس الكاتيجوريز v2.18.0) — عشان كده مش مدموج جوّه #1 أو #3.
 *      ⚠️ اسم الراوت فضل check-brand زي ما هو (مش rename) عشان ما يتكسرش أي
 *      كولر قديم — اللي اتوسّع هو الباراميترات والرد بس.
 *
 * 3) POST /wp-json/ecommoda/v1/link-product/{id}
 *    body: {
 *      vendor_name?: string, product_type?: string,
 *      sku?: string, global_unique_id?: string, slug?: string,
 *      variations: [{ id, sku?, stock_quantity?, global_unique_id?,
 *                      regular_price?, sale_price? }]
 *    }
 *    → نفس حرّاس #2 بيتنفّذوا هنا تاني (دفاع ثاني، race نادرة) قبل أي كتابة:
 *      أي براند/كاتيجوري ناقصة = 409 من غير أي كتابة خالص.
 *    → غير كده: status=publish + تصحيح الـ slug + meta الـ GTIN + ربط
 *      الـ Brand + **إضافة التلات كاتيجوريز (append — الكاتيجوريز الموجودة
 *      على المنتج مابتتشالش)**، وكل variation في الـ body بيتحدّث SKU/مخزون/
 *      GTIN/سعر — كل عنصر (منتج أو variation) معزول في try/catch لوحده، فشل
 *      واحد مايوقفش الباقي (نفس مبدأ عزل الخطوات في الأداة).
 *
 * الحماية: هيدر X-Sync-Header-Secret لازم يطابق SYNC_SECRET تحت — نفس
 * الاتفاق الموحّد المستخدم في snippet الـ price (variation-price)، نفس
 * القيمة بالظبط في الطرفين. القيمة على جانب Cloudflare بتتحط كسر اسمه
 * SYNC_SECRET في Worker "stylebox-products-linking-worker" (Worker منفصل
 * عن price/stock sync، فمحتاج نفس القيمة تتضاف له كسر مستقل رغم إنها
 * بتستخدم نفس اسم الـ constant هنا على ووردبريس).
 *
 * HPOS-safe: بيستخدم wc_get_product() / set_*() / save() فقط — مفيش أي
 * SQL مباشر أو WordPress meta functions قديمة.
 *
 * Cache: بعد أي كتابة (منتج أو variation) بيتم مسح الـ product transients
 * لنفس الـ ID والـ parent بتاعه — نفس درس snippet الـ price (من غير كده
 * السعر/الحالة ممكن ميتحدّثش فورًا على الواجهة أو الـ lookup table).
 *
 * مطابقة المقاس بالحجم، حساب السعر، وحساب الـ slug **مش هنا** — كلهم في
 * الـ Worker (JS)، الـ endpoint ده بينفّذ بس اللي الـ Worker جهّزه.
 * ⚠️ الاستثناء الوحيد المقصود: **مطابقة البراند والكاتيجوريز بالاسم** —
 * دي بتحصل هنا لأن مصدرها تاكسونومي ووردبريس نفسها، وأي نسخة تانية منها
 * في الـ Worker معناها نداء REST إضافي لكل تشغيلة (نفس السبب اللي خلّى
 * check-brand يعيش هنا من v2.14.0).
 * -----------------------------------------------------------------
 */

if (!defined('SYNC_SECRET')) {
    // ⚠️ لو الـ snippet ده أو snippet الـ price شغّال قبله وعرّف SYNC_SECRET
    // بقيمة حقيقية، السطر ده بيتخطّى تلقائيًا وبيُستخدم نفس السر الموجود.
    // غيّر القيمة دي لسر عشوائي طويل (32+ حرف) قبل النشر لو لسه مش معرّف —
    // ونفس القيمة بالظبط تتحط في Cloudflare Worker secret اسمها SYNC_SECRET.
    define('SYNC_SECRET', 'SYNC_SECRET');
}

// ─────────────────────────────────────────────────────────────────
// (v2.18.0) ثوابت الكاتيجوريز — نقطة التغيير الوحيدة لو الأسماء/الـ slugs
// اتغيّرت على ووردبريس:
//   • ECOMMODA_FOOTWEAR_CAT_SLUG   — الكاتيجوري الأب اللي كاتيجوريز الـ Type
//     بتاعة شوبيفاي بتتطابق مع **أولادها المباشرين** بالاسم.
//   • ECOMMODA_ALL_PRODUCTS_SLUG   — الكاتيجوري اللي بتتضاف لكل منتج مربوط.
// ⚠️ كاتيجوريز الـ Type **مش مكتوبة كقائمة ثابتة هنا عن قصد** — بتتقرا من
// أولاد Footwear وقت النداء. يعني إضافة/إعادة تسمية كاتيجوري فرعية على
// ووردبريس بتشتغل فورًا من غير أي تعديل في الكود ولا في الـ Worker.
// ─────────────────────────────────────────────────────────────────
if (!defined('ECOMMODA_FOOTWEAR_CAT_SLUG')) {
    define('ECOMMODA_FOOTWEAR_CAT_SLUG', 'footwear');
}
if (!defined('ECOMMODA_ALL_PRODUCTS_SLUG')) {
    define('ECOMMODA_ALL_PRODUCTS_SLUG', 'all-products');
}

add_action('rest_api_init', function () {

    // دالة تحقق مشتركة بين التلات endpoints
    $permission_check = function (WP_REST_Request $request) {
        $incoming = $request->get_header('x-sync-header-secret');
        if (!$incoming || !hash_equals(SYNC_SECRET, $incoming)) {
            return new WP_Error(
                'ec_unauthorized',
                'Invalid or missing X-Sync-Header-Secret header',
                array('status' => 401)
            );
        }
        return true;
    };

    // مطابقة حرفية (case-insensitive بعد trim) — نفس قاعدة الأداة كلها،
    // الاسم لازم يطابق الـ Vendor على شوبيفاي بالظبط. بترجع WP_Term أو null،
    // أو WP_Error لو تاكسونومي product_brand نفسها مش مسجّلة على الموقع.
    $find_brand_term = function ($vendor_name) {
        if (!taxonomy_exists('product_brand')) {
            return new WP_Error(
                'ec_no_taxonomy',
                'product_brand taxonomy غير مسجّلة على هذا الموقع',
                array('status' => 500)
            );
        }
        $terms = get_terms(array('taxonomy' => 'product_brand', 'hide_empty' => false));
        if (is_wp_error($terms)) {
            return $terms;
        }
        $target = mb_strtolower(trim((string) $vendor_name));
        foreach ($terms as $t) {
            if (mb_strtolower(trim($t->name)) === $target) {
                return $t;
            }
        }
        return null;
    };

    // ─────────────────────────────────────────────────────────
    // (v2.18.0) حرّاس الكاتيجوريز — product_cat
    // ⚠️ نفس قاعدة المطابقة بتاعة البراند بالحرف: مقارنة اسم حرفية
    // (case-insensitive بعد trim). مفيش مطابقة تقريبية ولا "أقرب اسم" —
    // كاتيجوري غلط معناها منتج بيظهر في قسم مش بتاعه على المتجر.
    // ─────────────────────────────────────────────────────────
    $term_summary = function ($term) {
        return $term ? array('id' => (int) $term->term_id, 'name' => $term->name, 'slug' => $term->slug) : null;
    };

    // كاتيجوري بالاسم — اختياريًا محصورة في أولاد كاتيجوري معيّنة ($parent_id).
    // $parent_id = null معناها البحث في كل الكاتيجوريز (المستخدم لكاتيجوري
    // البراند، لأنها مش مضمون إنها تفضل تحت "Brands" للأبد).
    $find_product_cat_by_name = function ($name, $parent_id = null) {
        $name = trim((string) $name);
        if ($name === '') {
            return null;
        }
        $args = array('taxonomy' => 'product_cat', 'hide_empty' => false);
        if ($parent_id !== null) {
            $args['parent'] = (int) $parent_id;
        }
        $terms = get_terms($args);
        if (is_wp_error($terms)) {
            return $terms;
        }
        $target = mb_strtolower($name);
        foreach ($terms as $t) {
            if (mb_strtolower(trim($t->name)) === $target) {
                return $t;
            }
        }
        return null;
    };

    // حارس الكاتيجوريز الموحّد — بيتنادى من check-brand (قبل أي كتابة) ومن
    // POST link-product (دفاع ثاني). بيرجّع مصفوفة فيها الحالة الكاملة:
    // كل كاتيجوري إما WP_Term أو null، + قائمة أسماء أولاد Footwear عشان
    // الواجهة تقدر تقول للموظف "المسموح إيه" لما الـ Type ما يطابقش.
    $resolve_link_terms = function ($vendor_name, $product_type) use ($find_brand_term, $find_product_cat_by_name) {
        if (!taxonomy_exists('product_cat')) {
            return new WP_Error(
                'ec_no_taxonomy',
                'product_cat taxonomy غير مسجّلة على هذا الموقع',
                array('status' => 500)
            );
        }

        $out = array(
            'brand'          => null,
            'brandCategory'  => null,
            'typeCategory'   => null,
            'allProducts'    => null,
            'footwear'       => null,
            'typeOptions'    => array(),
        );

        // (أ) البراند — Vendor فاضي = الحارس بيتخطّى تمامًا (نفس قاعدة v2.6.0)
        $vendor_name = trim((string) $vendor_name);
        if ($vendor_name !== '') {
            $brand = $find_brand_term($vendor_name);
            if (is_wp_error($brand)) {
                return $brand;
            }
            $out['brand'] = $brand;

            // (ب) كاتيجوري بنفس اسم البراند (تاكسونومي product_cat)
            $brand_cat = $find_product_cat_by_name($vendor_name);
            if (is_wp_error($brand_cat)) {
                return $brand_cat;
            }
            $out['brandCategory'] = $brand_cat;
        }

        // (ج) كاتيجوري الـ Type — من أولاد Footwear المباشرين بس
        $footwear = get_term_by('slug', ECOMMODA_FOOTWEAR_CAT_SLUG, 'product_cat');
        if ($footwear instanceof WP_Term) {
            $out['footwear'] = $footwear;
            $children = get_terms(array(
                'taxonomy'   => 'product_cat',
                'hide_empty' => false,
                'parent'     => (int) $footwear->term_id,
            ));
            if (is_wp_error($children)) {
                return $children;
            }
            foreach ($children as $c) {
                $out['typeOptions'][] = $c->name;
            }
            $product_type = trim((string) $product_type);
            if ($product_type !== '') {
                $target = mb_strtolower($product_type);
                foreach ($children as $c) {
                    if (mb_strtolower(trim($c->name)) === $target) {
                        $out['typeCategory'] = $c;
                        break;
                    }
                }
            }
        }

        // (د) all-products — بالـ slug مش بالاسم (الاسم "All products" ممكن
        // يتغيّر، والـ slug هو اللي بيدخل في الروابط فأثبت)
        $all = get_term_by('slug', ECOMMODA_ALL_PRODUCTS_SLUG, 'product_cat');
        $out['allProducts'] = ($all instanceof WP_Term) ? $all : null;

        return $out;
    };

    // ─────────────────────────────────────────────────────────
    // GET /wp-json/ecommoda/v1/check-brand?vendor_name=...&product_type=...
    // قراءة بس — بيرجّع حالة البراند والتلات كاتيجوريز، و**الـ Worker** هو
    // اللي بيقرر يوقف الربط ولا لأ (عشان رسالة الخطأ ورابط الإصلاح يفضلوا
    // في مكان واحد جنب باقي رسائل الأداة).
    // ─────────────────────────────────────────────────────────
    register_rest_route('ecommoda/v1', '/check-brand', array(
        'methods'             => 'GET',
        'permission_callback' => $permission_check,
        'callback'            => function (WP_REST_Request $request) use ($resolve_link_terms, $term_summary) {
            $vendor_name  = trim((string) $request->get_param('vendor_name'));
            $product_type = trim((string) $request->get_param('product_type'));

            $terms = $resolve_link_terms($vendor_name, $product_type);
            if (is_wp_error($terms)) {
                return $terms;
            }

            return array(
                'brand'               => $term_summary($terms['brand']),
                'brandCategory'       => $term_summary($terms['brandCategory']),
                'typeCategory'        => $term_summary($terms['typeCategory']),
                'allProductsCategory' => $term_summary($terms['allProducts']),
                'footwearCategory'    => $term_summary($terms['footwear']),
                'typeOptions'         => $terms['typeOptions'],
            );
        },
    ));

    // ─────────────────────────────────────────────────────────
    // GET /wp-json/ecommoda/v1/link-product/{id}
    // ─────────────────────────────────────────────────────────
    register_rest_route('ecommoda/v1', '/link-product/(?P<id>\d+)', array(
        'methods'             => 'GET',
        'permission_callback' => $permission_check,
        'callback'            => function (WP_REST_Request $request) {
            $id      = (int) $request['id'];
            $product = wc_get_product($id);

            if (!$product) {
                return new WP_Error(
                    'ec_not_found',
                    'Product not found: ' . $id,
                    array('status' => 404)
                );
            }

            $variations = array();
            if ($product->is_type('variable')) {
                $parent_attributes = $product->get_attributes();
                foreach ($product->get_children() as $child_id) {
                    $variation = wc_get_product($child_id);
                    if (!$variation) {
                        continue;
                    }

                    $attrs = array();
                    foreach ($variation->get_attributes() as $key => $value) {
                        if ($value === '' || $value === null) {
                            continue; // "Any <attribute>" — مفيش قيمة محدّدة
                        }
                        $name = isset($parent_attributes[$key]) ? $parent_attributes[$key]->get_name() : $key;
                        $attrs[] = array('name' => $name, 'option' => $value);
                    }

                    $variations[] = array(
                        'id'               => $variation->get_id(),
                        'sku'              => $variation->get_sku(),
                        'stock_quantity'   => $variation->get_stock_quantity(),
                        'global_unique_id' => $variation->get_global_unique_id(),
                        'attributes'       => $attrs,
                    );
                }
            }

            return array(
                'product' => array(
                    'id'               => $product->get_id(),
                    'name'             => $product->get_name(),
                    'slug'             => $product->get_slug(),
                    'sku'              => $product->get_sku(),
                    'global_unique_id' => $product->get_global_unique_id(),
                    'status'           => $product->get_status(),
                ),
                'variations' => $variations,
            );
        },
    ));

    // ─────────────────────────────────────────────────────────
    // POST /wp-json/ecommoda/v1/link-product/{id}
    // ─────────────────────────────────────────────────────────
    register_rest_route('ecommoda/v1', '/link-product/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'permission_callback' => $permission_check,
        'callback'            => function (WP_REST_Request $request) use ($resolve_link_terms, $term_summary) {
            $id   = (int) $request['id'];
            $body = $request->get_json_params();
            if (!is_array($body)) {
                $body = array();
            }

            // ── (1) الحرّاس — أول حاجة، قبل أي wc_get_product()/كتابة ──
            // نفس حرّاس check-brand بالحرف (دفاع ثاني — race نادرة جدًا لو حد
            // مسح براند/كاتيجوري في نفس الثواني دي). أي نقص هنا = 409 من غير
            // ما يتلمس المنتج ولا أي variation.
            $vendor_name  = isset($body['vendor_name'])  ? trim((string) $body['vendor_name'])  : '';
            $product_type = isset($body['product_type']) ? trim((string) $body['product_type']) : '';

            $terms = $resolve_link_terms($vendor_name, $product_type);
            if (is_wp_error($terms)) {
                return $terms;
            }

            $brand_term = $terms['brand'];
            if ($vendor_name !== '') {
                if (!$brand_term) {
                    return new WP_Error(
                        'ec_brand_missing',
                        'No product_brand term matches vendor: ' . $vendor_name,
                        array('status' => 409, 'vendor' => $vendor_name)
                    );
                }
                if (!$terms['brandCategory']) {
                    return new WP_Error(
                        'ec_brand_category_missing',
                        'No product_cat term matches vendor: ' . $vendor_name,
                        array('status' => 409, 'vendor' => $vendor_name)
                    );
                }
            }
            if (!$terms['footwear'] || !$terms['typeCategory']) {
                return new WP_Error(
                    'ec_type_category_missing',
                    'No product_cat child of "' . ECOMMODA_FOOTWEAR_CAT_SLUG . '" matches product type: ' . ($product_type === '' ? '(empty)' : $product_type),
                    array(
                        'status'       => 409,
                        'product_type' => $product_type,
                        'options'      => $terms['typeOptions'],
                        'footwear'     => $terms['footwear'] ? true : false,
                    )
                );
            }
            if (!$terms['allProducts']) {
                return new WP_Error(
                    'ec_all_products_category_missing',
                    'product_cat term with slug "' . ECOMMODA_ALL_PRODUCTS_SLUG . '" not found',
                    array('status' => 409, 'slug' => ECOMMODA_ALL_PRODUCTS_SLUG)
                );
            }

            // الكاتيجوريز المطلوب إضافتها — مرتّبة ومن غير تكرار
            $category_ids = array();
            foreach (array($terms['brandCategory'], $terms['typeCategory'], $terms['allProducts']) as $t) {
                if ($t && !in_array((int) $t->term_id, $category_ids, true)) {
                    $category_ids[] = (int) $t->term_id;
                }
            }

            // ── (2) كتابة المنتج — معزولة؛ فشلها مايمنعش محاولة الـ variations ──
            $product_error  = null;
            $product_result = null;
            $categories_applied = null;
            try {
                $product = wc_get_product($id);
                if (!$product) {
                    throw new Exception('product not found');
                }

                $product->set_status('publish');
                if (!empty($body['sku'])) {
                    $product->set_sku((string) $body['sku']);
                }
                if (!empty($body['global_unique_id'])) {
                    $product->set_global_unique_id((string) $body['global_unique_id']);
                }
                $product->update_meta_data(
                    '_shopify_product_id',
                    isset($body['global_unique_id']) ? (string) $body['global_unique_id'] : ''
                );
                if ($brand_term) {
                    wp_set_object_terms($id, array((int) $brand_term->term_id), 'product_brand', false);
                }
                // ⚠️ (v2.18.0) append = true — الكاتيجوريز الموجودة على المنتج
                // (زي فئة الشوز اللي الموظف بيضيفها بإيده) **مابتتشالش**.
                // wp_set_object_terms بـ$append=false هنا كان هيمسحها كلها.
                if ($category_ids) {
                    wp_set_object_terms($id, $category_ids, 'product_cat', true);
                }
                $product->save();

                if (!empty($body['slug'])) {
                    wp_update_post(array('ID' => $id, 'post_name' => sanitize_title((string) $body['slug'])));
                }

                wc_delete_product_transients($id); // زي snippet الـ price بالظبط

                // إعادة قراءة — التأكيد بيتقرا من الحالة الفعلية بعد الحفظ
                $product        = wc_get_product($id);
                $product_result = array(
                    'status'           => $product->get_status(),
                    'slug'             => $product->get_slug(),
                    'sku'              => $product->get_sku(),
                    'global_unique_id' => $product->get_global_unique_id(),
                );

                // ⚠️ تأكيد الكاتيجوريز من القيمة الراجعة مش من نجاح النداء —
                // نفس قاعدة status=publish بالظبط. wp_set_object_terms بترجّع
                // WP_Error في حالات (تاكسونومي/term مش موجود)، وبنقرا الحالة
                // الفعلية بعد الحفظ بدل ما نفترض.
                $current_ids = wp_get_object_terms($id, 'product_cat', array('fields' => 'ids'));
                $current_ids = is_wp_error($current_ids) ? array() : array_map('intval', $current_ids);
                $categories_applied = array();
                foreach (array(
                    'brand'       => $terms['brandCategory'],
                    'type'        => $terms['typeCategory'],
                    'allProducts' => $terms['allProducts'],
                ) as $role => $t) {
                    if (!$t) {
                        continue;
                    }
                    $summary = $term_summary($t);
                    $summary['role']      = $role;
                    $summary['confirmed'] = in_array((int) $t->term_id, $current_ids, true);
                    $categories_applied[] = $summary;
                }
            } catch (\Throwable $e) {
                $product_error = $e->getMessage();
            }

            // ── (3) الـ variations — كل واحدة معزولة لوحدها ──
            $variation_results = array();
            $variations_input  = isset($body['variations']) && is_array($body['variations']) ? $body['variations'] : array();
            foreach ($variations_input as $v) {
                $vid = isset($v['id']) ? (int) $v['id'] : 0;
                $row = array('id' => $vid);
                try {
                    $variation = $vid ? wc_get_product($vid) : null;
                    if (!$variation || (int) $variation->get_parent_id() !== $id) {
                        throw new Exception('variation not found or does not belong to this product');
                    }

                    // ⚠️ درس snippet الـ price: sale_price >= regular_price
                    // بترفضها ووكومرس بصمت من غير أي error — لازم نتحقق إحنا
                    // قبل ما نبعتها، ونعزلها كخطأ واضح لو حصلت بدل نجاح كاذب.
                    if (array_key_exists('regular_price', $v) && array_key_exists('sale_price', $v)) {
                        $reg  = (string) $v['regular_price'];
                        $sale = (string) $v['sale_price'];
                        if ($sale !== '' && is_numeric($sale) && is_numeric($reg) && (float) $sale >= (float) $reg) {
                            throw new Exception('sale_price must be less than regular_price');
                        }
                    }

                    if (isset($v['sku'])) {
                        $variation->set_sku((string) $v['sku']);
                    }
                    if (isset($v['stock_quantity'])) {
                        $variation->set_manage_stock(true);
                        $variation->set_stock_quantity((int) $v['stock_quantity']);
                    }
                    if (isset($v['global_unique_id'])) {
                        $variation->set_global_unique_id((string) $v['global_unique_id']);
                    }
                    $variation->update_meta_data(
                        '_shopify_variation_id',
                        isset($v['global_unique_id']) ? (string) $v['global_unique_id'] : ''
                    );
                    if (array_key_exists('regular_price', $v)) {
                        $variation->set_regular_price((string) $v['regular_price']);
                    }
                    if (array_key_exists('sale_price', $v)) {
                        $variation->set_sale_price((string) $v['sale_price']); // '' يشيل الخصم
                    }
                    $variation->save();

                    // مسح الكاش — نفس درس snippet الـ price بالحرف
                    wc_delete_product_transients($vid);
                    wc_delete_product_transients($id);

                    $variation             = wc_get_product($vid); // إعادة قراءة للتأكيد
                    $row['ok']             = true;
                    $row['sku']            = $variation->get_sku();
                    $row['stock_quantity'] = $variation->get_stock_quantity();
                    $row['regular_price']  = $variation->get_regular_price();
                    $row['sale_price']     = $variation->get_sale_price();
                } catch (\Throwable $e) {
                    $row['ok']    = false;
                    $row['error'] = $e->getMessage();
                }
                $variation_results[] = $row;
            }

            return array(
                'brand'         => $term_summary($brand_term),
                'categories'    => $categories_applied,
                'product'       => $product_result,
                'product_error' => $product_error,
                'variations'    => $variation_results,
            );
        },
    ));

});
