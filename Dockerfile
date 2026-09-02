# -------------------------------------------------------------
# Stage 1: Build Golang Fullstack Application
# -------------------------------------------------------------
FROM golang:alpine AS builder

# Izinkan download toolchain jika diperlukan
ENV GOTOOLCHAIN=auto

WORKDIR /app

# Salin dependensi
COPY go.mod go.sum ./
RUN go mod download

# Salin source code & file frontend index.html
COPY . .

# Compile binary secara statis & ramping
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o absensi-app main.go

# -------------------------------------------------------------
# Stage 2: Runtime Image Ringan (Alpine)
# -------------------------------------------------------------
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Jakarta

WORKDIR /app

# Salin executable binary dan index.html
COPY --from=builder /app/absensi-app /app/absensi-app
COPY --from=builder /app/index.html /app/index.html

# Buat direktori data untuk database SQLite
RUN mkdir -p /app/data

# Expose port REST API & Web UI
EXPOSE 8080

# Jalankan aplikasi fullstack
CMD ["/app/absensi-app"]
