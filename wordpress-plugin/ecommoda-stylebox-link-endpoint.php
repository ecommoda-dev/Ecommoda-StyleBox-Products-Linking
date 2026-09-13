<?php
/**
 * Plugin Name: EcomModa StyleBox — Link Product Endpoint
 * Description: Custom REST endpoints (ecommoda/v1/link-product/{id}, ecommoda/v1/check-brand)
 *              used by the stylebox-products-linking-worker Cloudflare Worker to read and
 *              write everything a product needs in 2-3 requests instead of 5-6 separate
 *              /wc/v3/* calls. Built to solve the ~30-request hosting-level 429 throttle on
 *              stylebox.online — see §8 in this tool's CLAUDE.md and WCRATELIMIT.md.
 * Version:     1.0.0
 * Author:      EcomModa
 *
 * ⚠️ Manual install — this repo has no deploy pipeline to WordPress. Upload this single
 * file to wp-content/plugins/ecommoda-stylebox-link-endpoint/ecommoda-stylebox-link-endpoint.php
 * (or zip the folder and use Plugins → Add New → Upload Plugin), activate it, then define
 * the shared secret — add this line to wp-config.php ABOVE the
 * "/* That's all, stop editing! *\/" line:
 *
 *   define( 'ECOMMODA_STYLEBOX_LINK_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_STRING' );
 *
 * The SAME string must be set as the WC_LINK_SECRET secret on the Cloudflare Worker
 * (Dashboard → Settings → Variables → Secrets → Promote). Never commit the real value.
 *
 * Matching (which WC variation maps to which Shopify variant, price computation, slug
 * computation) is deliberately NOT done here — it stays in the Worker (JS), the tool's
 * single source of truth for that logic. This file only executes what the Worker already
 * decided, inside WordPress, to save network round-trips to the site's own REST API.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // no direct access
}

// ─── auth ────────────────────────────────────────────────────────────────
// Same convention already used elsewhere in the EcomModa stack for custom WP
// endpoints (e.g. ecommoda/v1/variation-stock/{id}) — a shared secret header,
// not WooCommerce REST consumer key/secret.
function ecommoda_stylebox_link_get_secret() {
	if ( defined( 'ECOMMODA_STYLEBOX_LINK_SECRET' ) && ECOMMODA_STYLEBOX_LINK_SECRET !== '' ) {
		return (string) ECOMMODA_STYLEBOX_LINK_SECRET;
	}
	$opt = get_option( 'ecommoda_stylebox_link_secret', '' );
	return is_string( $opt ) ? trim( $opt ) : '';
}

function ecommoda_stylebox_link_verify_secret( WP_REST_Request $request ) {
	$expected = ecommoda_stylebox_link_get_secret();
	if ( $expected === '' ) {
		return new WP_Error(
			'ecommoda_link_misconfigured',
			'ECOMMODA_STYLEBOX_LINK_SECRET غير مضبوط على السيرفر — عرّفه في wp-config.php',
			array( 'status' => 500 )
		);
	}
	$given = $request->get_header( 'x-ecommoda-secret' );
	if ( ! is_string( $given ) || ! hash_equals( $expected, $given ) ) {
		return new WP_Error( 'ecommoda_link_unauthorized', 'Unauthorized', array( 'status' => 401 ) );
	}
	return true;
}

// ─── routes ──────────────────────────────────────────────────────────────
add_action( 'rest_api_init', function () {
	register_rest_route(
		'ecommoda/v1',
		'/link-product/(?P<id>\d+)',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE, // GET
				'callback'            => 'ecommoda_stylebox_link_product_get',
				'permission_callback' => '__return_true', // auth handled inside via secret header
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE, // POST
				'callback'            => 'ecommoda_stylebox_link_product_post',
				'permission_callback' => '__return_true',
			),
		)
	);

	register_rest_route(
		'ecommoda/v1',
		'/check-brand',
		array(
			'methods'             => WP_REST_Server::READABLE, // GET
			'callback'            => 'ecommoda_stylebox_check_brand',
			'permission_callback' => '__return_true',
		)
	);
} );

// ─── brand lookup (shared by check-brand and the POST write guard) ───────
// Literal match, case-insensitive after trim — same rule as everywhere else
// in this tool (wcProductMatchesShopifyId-adjacent: exact identity, never a
// fuzzy match). Returns a WP_Term or null. Returns WP_Error if the
// product_brand taxonomy itself isn't registered on this site.
function ecommoda_stylebox_find_brand_term( $vendor_name ) {
	if ( ! taxonomy_exists( 'product_brand' ) ) {
		return new WP_Error( 'ecommoda_link_no_taxonomy', 'product_brand taxonomy غير مسجّلة على هذا الموقع' );
	}
	$terms = get_terms( array( 'taxonomy' => 'product_brand', 'hide_empty' => false ) );
	if ( is_wp_error( $terms ) ) {
		return $terms;
	}
	$target = mb_strtolower( trim( (string) $vendor_name ) );
	foreach ( $terms as $t ) {
		if ( mb_strtolower( trim( $t->name ) ) === $target ) {
			return $t;
		}
	}
	return null;
}

// ─── GET /ecommoda/v1/check-brand?vendor_name=... ─────────────────────────
// Read-only, product-agnostic. Called by the Worker BEFORE it writes
// anything to Shopify (the brand guard must block Shopify too, not just
// WooCommerce — see syncProduct()/§8 in CLAUDE.md), so it cannot be folded
// into link-product's GET (product id is known before the Shopify vendor
// name is) or POST (which only runs after the Shopify write already
// happened). Always 200 — a missing brand is not an error here, the caller
// decides what to do with brand:null.
function ecommoda_stylebox_check_brand( WP_REST_Request $request ) {
	$auth = ecommoda_stylebox_link_verify_secret( $request );
	if ( is_wp_error( $auth ) ) {
		return $auth;
	}

	$vendor_name = trim( (string) $request->get_param( 'vendor_name' ) );
	if ( $vendor_name === '' ) {
		return new WP_REST_Response( array( 'ok' => true, 'brand' => null ), 200 );
	}

	$term = ecommoda_stylebox_find_brand_term( $vendor_name );
	if ( is_wp_error( $term ) ) {
		return new WP_REST_Response( array( 'ok' => false, 'error' => $term->get_error_message() ), 500 );
	}

	return new WP_REST_Response(
		array(
			'ok'    => true,
			'brand' => $term ? array( 'id' => $term->term_id, 'name' => $term->name ) : null,
		),
		200
	);
}

// ─── GET /ecommoda/v1/link-product/{id} ────────────────────────────────────
// Read-only: the product + every variation's size attribute, sku, stock and
// GTIN, in one response — replaces separate GET product + GET variations
// calls. Attribute shape is deliberately minimal ({name, option} pairs) —
// only what findWcSize()/ALLOWED_SIZE_ATTRIBUTE_NAMES on the Worker side
// need, not the full wc/v3 REST attribute shape.
function ecommoda_stylebox_link_product_get( WP_REST_Request $request ) {
	$auth = ecommoda_stylebox_link_verify_secret( $request );
	if ( is_wp_error( $auth ) ) {
		return $auth;
	}

	$id      = (int) $request['id'];
	$product = wc_get_product( $id );
	if ( ! $product ) {
		return new WP_REST_Response( array( 'ok' => false, 'error' => 'product_not_found' ), 404 );
	}

	$variations = array();
	if ( $product->is_type( 'variable' ) ) {
		$parent_attributes = $product->get_attributes();
		foreach ( $product->get_children() as $child_id ) {
			$variation = wc_get_product( $child_id );
			if ( ! $variation ) {
				continue;
			}

			$attrs = array();
			foreach ( $variation->get_attributes() as $key => $value ) {
				if ( $value === '' || $value === null ) {
					continue; // "Any <attribute>" — no concrete option chosen
				}
				$name = isset( $parent_attributes[ $key ] ) ? $parent_attributes[ $key ]->get_name() : $key;
				$attrs[] = array( 'name' => $name, 'option' => $value );
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

	return new WP_REST_Response(
		array(
			'ok'      => true,
			'product' => array(
				'id'               => $product->get_id(),
				'name'             => $product->get_name(),
				'slug'             => $product->get_slug(),
				'sku'              => $product->get_sku(),
				'global_unique_id' => $product->get_global_unique_id(),
				'status'           => $product->get_status(),
			),
			'variations' => $variations,
		),
		200
	);
}

// ─── POST /ecommoda/v1/link-product/{id} ───────────────────────────────────
// The write: product-level (status=publish + slug fix + _shopify_product_id/
// global_unique_id meta + Brand link) and every variation (sku/stock/GTIN/
// price), in one request. Mirrors syncProduct()'s isolation rules exactly:
//   - brand guard runs FIRST, before touching the product or any variation —
//     if the vendor doesn't match a product_brand term, nothing is written
//     and a 409 is returned (same contract as before v2.14.0).
//   - the product-level write and the variations loop are two independent
//     try/catch scopes: a product-level failure never stops the variations
//     from being attempted, and one variation's failure never stops another.
function ecommoda_stylebox_link_product_post( WP_REST_Request $request ) {
	$auth = ecommoda_stylebox_link_verify_secret( $request );
	if ( is_wp_error( $auth ) ) {
		return $auth;
	}

	$id   = (int) $request['id'];
	$body = $request->get_json_params();
	if ( ! is_array( $body ) ) {
		$body = array();
	}

	// ── (1) brand guard — first thing, before any wc_get_product()/write ──
	$vendor_name = isset( $body['vendor_name'] ) ? trim( (string) $body['vendor_name'] ) : '';
	$brand_term  = null;
	if ( $vendor_name !== '' ) {
		$brand_term = ecommoda_stylebox_find_brand_term( $vendor_name );
		if ( is_wp_error( $brand_term ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => $brand_term->get_error_message() ), 500 );
		}
		if ( ! $brand_term ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'code' => 'brand_missing', 'vendor' => $vendor_name ),
				409
			);
		}
	}

	// ── (2) product-level write — isolated; its failure must not block variations ──
	$product_error  = null;
	$product_result = null;
	try {
		$product = wc_get_product( $id );
		if ( ! $product ) {
			throw new Exception( 'product not found' );
		}

		$product->set_status( 'publish' );
		if ( ! empty( $body['sku'] ) ) {
			$product->set_sku( (string) $body['sku'] );
		}
		if ( ! empty( $body['global_unique_id'] ) ) {
			$product->set_global_unique_id( (string) $body['global_unique_id'] );
		}
		$product->update_meta_data(
			'_shopify_product_id',
			isset( $body['global_unique_id'] ) ? (string) $body['global_unique_id'] : ''
		);
		if ( $brand_term ) {
			wp_set_object_terms( $id, array( (int) $brand_term->term_id ), 'product_brand', false );
		}
		$product->save();

		if ( ! empty( $body['slug'] ) ) {
			wp_update_post( array( 'ID' => $id, 'post_name' => sanitize_title( (string) $body['slug'] ) ) );
		}

		// re-read: confirmation must come from actual persisted state, not
		// from the fact the calls above didn't throw (Step 5A rule already
		// used everywhere else in this tool).
		$product        = wc_get_product( $id );
		$product_result = array(
			'status'           => $product->get_status(),
			'slug'             => $product->get_slug(),
			'sku'              => $product->get_sku(),
			'global_unique_id' => $product->get_global_unique_id(),
		);
	} catch ( \Throwable $e ) {
		$product_error = $e->getMessage();
	}

	// ── (3) variations — each isolated on its own, same as wc/v3/variations/batch ──
	$variation_results = array();
	$variations_input   = isset( $body['variations'] ) && is_array( $body['variations'] ) ? $body['variations'] : array();
	foreach ( $variations_input as $v ) {
		$vid = isset( $v['id'] ) ? (int) $v['id'] : 0;
		$row = array( 'id' => $vid );
		try {
			$variation = $vid ? wc_get_product( $vid ) : null;
			if ( ! $variation || (int) $variation->get_parent_id() !== $id ) {
				throw new Exception( 'variation not found or does not belong to this product' );
			}

			if ( isset( $v['sku'] ) ) {
				$variation->set_sku( (string) $v['sku'] );
			}
			if ( isset( $v['stock_quantity'] ) ) {
				$variation->set_manage_stock( true );
				$variation->set_stock_quantity( (int) $v['stock_quantity'] );
			}
			if ( isset( $v['global_unique_id'] ) ) {
				$variation->set_global_unique_id( (string) $v['global_unique_id'] );
			}
			$variation->update_meta_data(
				'_shopify_variation_id',
				isset( $v['global_unique_id'] ) ? (string) $v['global_unique_id'] : ''
			);
			if ( array_key_exists( 'regular_price', $v ) ) {
				$variation->set_regular_price( (string) $v['regular_price'] );
			}
			if ( array_key_exists( 'sale_price', $v ) ) {
				$variation->set_sale_price( (string) $v['sale_price'] );
			}
			$variation->save();

			$variation              = wc_get_product( $vid ); // re-read — same confirmation rule
			$row['ok']              = true;
			$row['sku']             = $variation->get_sku();
			$row['stock_quantity']  = $variation->get_stock_quantity();
			$row['regular_price']   = $variation->get_regular_price();
			$row['sale_price']      = $variation->get_sale_price();
		} catch ( \Throwable $e ) {
			$row['ok']    = false;
			$row['error'] = $e->getMessage();
		}
		$variation_results[] = $row;
	}

	return new WP_REST_Response(
		array(
			'ok'            => true,
			'brand'         => $brand_term ? array( 'id' => $brand_term->term_id, 'name' => $brand_term->name ) : null,
			'product'       => $product_result,
			'product_error' => $product_error,
			'variations'    => $variation_results,
		),
		200
	);
}

// ─── admin notice — mirrors the WORKER_SECRET-missing guard on the Cloudflare
// side (index.js §HANDLER): a missing secret here must be loud, not a silent
// 401 nobody investigates until someone runs sync_product. ────────────────
add_action( 'admin_notices', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( ecommoda_stylebox_link_get_secret() !== '' ) {
		return;
	}
	echo '<div class="notice notice-error"><p><strong>EcomModa StyleBox — Link Product Endpoint:</strong> '
		. 'ECOMMODA_STYLEBOX_LINK_SECRET غير مضبوط — عرّفه في wp-config.php (نفس القيمة المضبوطة '
		. 'كـ WC_LINK_SECRET على الـ Cloudflare Worker)، وإلا كل نداء لـ ecommoda/v1/link-product '
		. 'هيرجع 500.</p></div>';
} );
