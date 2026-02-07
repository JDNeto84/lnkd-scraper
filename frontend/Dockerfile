FROM dart:stable AS build
ARG API_BASE_URL
ARG TELEGRAM_BOT_URL
RUN apt-get update && apt-get install -y curl unzip xz-utils git
RUN git clone https://github.com/flutter/flutter.git /usr/local/flutter
RUN cd /usr/local/flutter && git fetch --tags
RUN cd /usr/local/flutter && git checkout 3.24.0
ENV PATH="/usr/local/flutter/bin:/usr/local/flutter/bin/cache/dart-sdk/bin:${PATH}"
RUN flutter precache --web
WORKDIR /app
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get
COPY . .
RUN flutter build web --release \
    --dart-define=API_BASE_URL=${API_BASE_URL} \
    --dart-define=TELEGRAM_BOT_URL=${TELEGRAM_BOT_URL}

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
