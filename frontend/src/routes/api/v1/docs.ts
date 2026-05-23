import { createFileRoute } from "@tanstack/react-router";

// GET /api/v1/docs — interactive API reference. Renders the Scalar UI against
// the live OpenAPI spec at /api/v1/openapi, so the docs never drift from the
// implementation. Embedded as an iframe by the CLI / API settings page and
// also linkable on its own.
const HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crema Sales API reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi"></script>
    <script>
      var configuration = { theme: "default", hideDownloadButton: false };
      document.getElementById("api-reference").dataset.configuration =
        JSON.stringify(configuration);
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export const Route = createFileRoute("/api/v1/docs")({
  server: {
    handlers: {
      GET: async () =>
        new Response(HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    },
  },
});
