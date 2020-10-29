FROM node:12.19.0-alpine

RUN mkdir -p /server
WORKDIR /server

COPY package.json /server
COPY package-lock.json /server

RUN npm install

COPY . /server

CMD ["npm","start"]
