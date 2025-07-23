# 1. 빌드 스테이지
FROM node:18-alpine AS builder

WORKDIR /app

# package.json, package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci

# 소스 전체 복사
COPY . .

# Next.js 빌드
RUN npm run build

# 2. 런타임 스테이지 (경량 이미지)
FROM node:18-alpine AS runner

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드 결과 및 필요한 파일 복사
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/services ./services
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/components ./components
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/middleware ./middleware

# 환경변수 포트 지정
ENV PORT=3000

# 3000 포트 오픈
EXPOSE 3000

# Next.js 프로덕션 서버 실행
CMD ["npm", "start"]