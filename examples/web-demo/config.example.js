// Copy to config.js (git-ignored) and edit if you need non-default values:
//   cp config.example.js config.js
//
// baseUrl: "" means same-origin — requests go through the Vite proxy (vite.config.js)
//          to http://localhost:4000. Leave it "" for the standard local setup.
// apiKey:  the documented local dev key seeded by the API's DevApiKeySeeder.
//          NOT a production secret. Never commit a real key.
window.SPHYRA_CONFIG = {
  baseUrl: "",
  apiKey: "sphyra_dev_local",
};
