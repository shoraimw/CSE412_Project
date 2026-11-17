/**
 * Same-origin API gateway for the DRIVE Pages frontend.
 *
 * The backend is the existing, separate CSE412 Cloudflare Worker. A Pages
 * Service Binding keeps this hop inside Cloudflare and avoids depending on
 * the account-wide workers.dev subdomain. NEXORA is not referenced or changed.
 */
export async function onRequest({ request, env }) {
  if (!env.DRIVE_API) {
    return new Response(
      JSON.stringify({ message: "DRIVE API service binding is not configured." }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  // Browser requests are same-origin on drive-ewu.pages.dev. Strip the
  // browser Origin header before forwarding so the backend does not apply
  // cross-origin CORS rules to this internal service-binding request. The
  // binding uses the DRIVE Worker internally, without a public upstream URL.
  const forwarded = new Request(request);
  const headers = new Headers(forwarded.headers);
  headers.delete("origin");

  return env.DRIVE_API.fetch(new Request(forwarded, { headers }));
}
