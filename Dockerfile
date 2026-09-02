# -------------------------------------------------------------
# Stage 1: Build React + Vite Frontend
# -------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Build Golang Fullstack Server
# -------------------------------------------------------------
FROM golang:alpine AS backend-builder

ENV GOTOOLCHAIN=auto
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

# Salin source code backend
COPY main.go ./

# Salin hasil build React dist dari Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Compile binary secara statis & ramping
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o absensi-app main.go

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
