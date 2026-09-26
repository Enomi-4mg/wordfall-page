const LEGACY_HOSTNAME = "wordfall-page.miyashu2741.workers.dev";
const CANONICAL_HOSTNAME = "wordfall.4mg.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === LEGACY_HOSTNAME) {
      url.hostname = CANONICAL_HOSTNAME;
      return Response.redirect(url.toString(), 308);
    }

    return env.ASSETS.fetch(request);
  },
};
