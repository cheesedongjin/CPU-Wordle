FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake pkg-config libcivetweb-dev libcjson-dev libutf8proc-dev libpq-dev libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY CMakeLists.txt ./
COPY src ./src
COPY tests ./tests
COPY data ./data
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j2 && ctest --test-dir build --output-on-failure

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libcivetweb1 libcjson1 libutf8proc2 libpq5 libssl3 ca-certificates && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 wordle
WORKDIR /app
COPY --from=build /app/build/wordle ./wordle
COPY data ./data
COPY web ./web
ENV PORT=8080
USER wordle
EXPOSE 8080
CMD ["./wordle"]
