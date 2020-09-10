FROM node:6.10.2

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y graphicsmagick

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

COPY package.json /usr/src/app/
RUN npm install && npm cache clean

COPY . /usr/src/app
ADD ./config/test.json config/

CMD [ "npm", "start" ]

EXPOSE 4040