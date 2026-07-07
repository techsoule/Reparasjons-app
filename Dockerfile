# Alternativ utrulling via Docker (Railway, Fly.io, egen server osv.)
FROM node:22-alpine

WORKDIR /app

# Installer avhengigheter først (bedre cache)
COPY package*.json ./
RUN npm install --omit=dev

# Kopier resten av appen
COPY . .

# Data lagres på et volum montert her (så det overlever omstart)
ENV DATA_DIR=/data
VOLUME /data

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
