FROM node:22-alpine

WORKDIR /usr/src/app
COPY package*.json ./

#RUN npm ci --only=production
RUN npm install
COPY . .
RUN npm run build

CMD [ "node", "dist/index.js" ]

