FROM golang:1.26-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY config ./config
COPY controllers ./controllers
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY views ./views
RUN CGO_ENABLED=0 go build -trimpath -o /gateway .
FROM alpine:3.23
RUN apk add --no-cache ca-certificates && adduser -D app
USER app
COPY --from=build /gateway /gateway
ENV GATEWAY_ADDR=0.0.0.0:3101
EXPOSE 3101
CMD ["/gateway"]
