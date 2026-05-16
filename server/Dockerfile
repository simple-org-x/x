# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the Go API server.
#   - builder: golang:1.22-alpine compiles a static binary
#   - runtime: alpine with the binary and CA certs only
#
# The binary is statically linked (CGO_ENABLED=0) so the runtime image
# does not need glibc. EXPOSE 8080; the actual listen address is
# controlled at runtime via PORT / HTTP_ADDR.

FROM golang:1.22-alpine AS builder

WORKDIR /src

# Cache module downloads on a stable layer.
COPY go.mod go.sum ./
RUN go mod download

# Then copy the rest of the sources and build.
COPY . .

ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-trimpath
RUN go build -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.20

RUN apk add --no-cache ca-certificates && \
    adduser -D -H -u 10001 cas

COPY --from=builder /out/api /api

USER cas
EXPOSE 8080
ENTRYPOINT ["/api"]
