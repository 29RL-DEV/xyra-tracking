import type { MetadataRoute } from "next";

/**
 * Crawlers may read the public pages. The staff area and the API are off
 * limits. Tracking pages are not disallowed here on purpose: a crawler has to
 * be able to fetch one to see its `noindex`, which is what keeps an
 * individual shipment out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/staff"] },
  };
}
