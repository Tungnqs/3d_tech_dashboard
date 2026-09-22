# Static dashboard served by nginx. Cloud Run injects $PORT; the nginx image
# renders /etc/nginx/templates/*.template with envsubst at startup.
FROM nginx:1.27-alpine

ENV PORT=8080

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

COPY index.html style.css app.js /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
