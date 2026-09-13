<?php
/**
 * EcomModa — StyleBox Link Product API
 * -----------------------------------------------------------------
 * غرض هذا الـ snippet: يفتح 3 endpoints جديدة تحت namespace ecommoda/v1
 * منفصلة تمامًا عن أي snippet تاني (زي variation-stock / variation-price)،
 * بيستخدمها stylebox-products-linking-worker عشان يعمل شغل ربط المنتج كله
 * (publish + slug fix + meta + Brand + كل الـ Variations) في 2-3 نداءات
 * بدل 5-6 نداءات لـ /wc/v3/* منفصلة — راجع §8 في CLAUDE.md بتاع الأداة دي
 * (Ecommoda-StyleBox-Products-Linking) للتفاصيل الكاملة.
 *
 * 1) GET  /wp-json/ecommoda/v1/link-product/{id}
 *    → يرجع المنتج (id/name/slug/sku/gtin/status) + كل الـ Variations
 *      (id/sku/stock_quantity/gtin/attributes) في نداء واحد
 *
 * 2) GET  /wp-json/ecommoda/v1/check-brand?vendor_name=...
 *    → مستقل عن أي منتج — بيتحقق هل فيه term بنفس الاسم على تاكسونومي
 *      product_brand ولا لأ. لازم يتنادى **قبل** أي كتابة على شوبيفاي أو
 *      ووكومرس (حارس البراند v2.6.0 في الأداة) — عشان كده مش مدموج جوّه
 *      #1 أو #3.
 *
 * 3) POST /wp-json/ecommoda/v1/link-product/{id}
 *    body: {
 *      vendor_name?: string, sku?: string, global_unique_id?: string,
 *      slug?: string,
 *      variations: [{ id, sku?, stock_quantity?, global_unique_id?,
 *                      regular_price?, sale_price? }]
 *    }
 *    → لو vendor_name اتبعت ومفيش term مطابق: 409 (ec_brand_missing) من غير
 *      أي كتابة خالص — دفاع ثاني بعد check-brand فوق (race نادرة).
 *    → غير كده: status=publish + تصحيح الـ slug + meta الـ GTIN + ربط
 *      الـ Brand، وكل variation في الـ body بيتحدّث SKU/مخزون/GTIN/سعر —
 *      كل عنصر (منتج أو variation) معزول في try/catch لوحده، فشل واحد
 *      مايوقفش الباقي (نفس مبدأ عزل الخطوات في الأداة).
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
 * -----------------------------------------------------------------
 */

if (!defined('SYNC_SECRET')) {
    // ⚠️ لو الـ snippet ده أو snippet الـ price شغّال قبله وعرّف SYNC_SECRET
    // بقيمة حقيقية، السطر ده بيتخطّى تلقائيًا وبيُستخدم نفس السر الموجود.
    // غيّر القيمة دي لسر عشوائي طويل (32+ حرف) قبل النشر لو لسه مش معرّف —
    // ونفس القيمة بالظبط تتحط في Cloudflare Worker secret اسمها SYNC_SECRET.
    define('SYNC_SECRET', 'SYNC_SECRET');
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
    // GET /wp-json/ecommoda/v1/check-brand?vendor_name=...
    // ─────────────────────────────────────────────────────────
    register_rest_route('ecommoda/v1', '/check-brand', array(
        'methods'             => 'GET',
        'permission_callback' => $permission_check,
        'callback'            => function (WP_REST_Request $request) use ($find_brand_term) {
            $vendor_name = trim((string) $request->get_param('vendor_name'));
            if ($vendor_name === '') {
                return array('brand' => null);
            }

            $term = $find_brand_term($vendor_name);
            if (is_wp_error($term)) {
                return $term;
            }

            return array(
                'brand' => $term ? array('id' => $term->term_id, 'name' => $term->name) : null,
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
        'callback'            => function (WP_REST_Request $request) use ($find_brand_term) {
            $id   = (int) $request['id'];
            $body = $request->get_json_params();
            if (!is_array($body)) {
                $body = array();
            }

            // ── (1) حارس البراند — أول حاجة، قبل أي wc_get_product()/كتابة ──
            $vendor_name = isset($body['vendor_name']) ? trim((string) $body['vendor_name']) : '';
            $brand_term  = null;
            if ($vendor_name !== '') {
                $brand_term = $find_brand_term($vendor_name);
                if (is_wp_error($brand_term)) {
                    return $brand_term;
                }
                if (!$brand_term) {
                    return new WP_Error(
                        'ec_brand_missing',
                        'No product_brand term matches vendor: ' . $vendor_name,
                        array('status' => 409, 'vendor' => $vendor_name)
                    );
                }
            }

            // ── (2) كتابة المنتج — معزولة؛ فشلها مايمنعش محاولة الـ variations ──
            $product_error  = null;
            $product_result = null;
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
                'brand'         => $brand_term ? array('id' => $brand_term->term_id, 'name' => $brand_term->name) : null,
                'product'       => $product_result,
                'product_error' => $product_error,
                'variations'    => $variation_results,
            );
        },
    ));

});
