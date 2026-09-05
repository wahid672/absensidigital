# -------------------------------------------------------------
# Stage 1: Build React + Vite Frontend
# Always build natively on builder host (x86_64), as web assets are arch-independent
# -------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Build Golang Fullstack Server
# Cross-compile natively using Go compiler without slow QEMU emulation
# -------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:alpine AS backend-builder

ARG TARGETOS
ARG TARGETARCH

ENV GOTOOLCHAIN=auto
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

# Salin source code backend
COPY main.go ./

# Salin hasil build React dist dari Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Compile binary secara statis & ramping untuk target architecture
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -ldflags="-w -s" -o absensi-app main.go

# -------------------------------------------------------------
# Stage 3: Runtime Image Ringan (Alpine Linux)
# -------------------------------------------------------------
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Jakarta

WORKDIR /app

# Salin executable binary yang sudah meng-embed React frontend
COPY --from=backend-builder /app/absensi-app /app/absensi-app

# Buat direktori data untuk database SQLite permanen
RUN mkdir -p /app/data

# Expose port REST API & Web Admin UI
EXPOSE 8080

# Jalankan aplikasi fullstack
CMD ["/app/absensi-app"]
