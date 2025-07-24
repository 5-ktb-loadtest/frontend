/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,  // URL 끝에 슬래시 추가 (정적 호스팅 호환성)
  images: {
    unoptimized: true  // Next.js 이미지 최적화 비활성화 (서버 필요)
  },
  reactStrictMode: false, // 에러 처리 문제 해결을 위해 일시적으로 비활성화
  transpilePackages: ['@vapor-ui/core', '@vapor-ui/icons'],
  // 개발 환경에서의 에러 오버레이 설정
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-right'
  },
  // 개발 환경에서만 더 자세한 에러 로깅
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      forceSwcTransforms: true
    }
  })
};

module.exports = nextConfig;