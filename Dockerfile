# Static dashboard served by nginx. Cloud Run injects $PORT; the nginx image
# renders /etc/nginx/templates/*.template with envsubst at startup.
FROM nginx:1.27-alpine

ENV PORT=8080

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

COPY index.html style.css app.js /usr/share/nginx/html/

# Cache busting: CSS/JS are served with a 7-day immutable cache, so every build must
# reference them under a new URL. Cloud Build passes the commit SHA; local builds get "dev".
ARG ASSET_VERSION=dev
RUN sed -i \
      -e "s#href=\"style.css\"#href=\"style.css?v=${ASSET_VERSION}\"#" \
      -e "s#src=\"app.js\"#src=\"app.js?v=${ASSET_VERSION}\"#" \
      /usr/share/nginx/html/index.html \
 && grep -q "style.css?v=${ASSET_VERSION}" /usr/share/nginx/html/index.html \
 && grep -q "app.js?v=${ASSET_VERSION}" /usr/share/nginx/html/index.html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
