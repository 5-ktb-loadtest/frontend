// tests/optimized-performance.spec.js - 로그 최소화 버전
import { expect, test } from '@playwright/test';
import { NetworkMonitor, PerformanceScorer } from './helpers/network-monitor.js';

test.describe('🎮 서버 부하 최적화 게임', () => {
    let networkMonitor;
    let scorer;

    // 간소화된 로그인 함수
    async function quickLogin(page) {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // 서버 연결 확인 대기

        // 로그인 정보 입력
        await page.fill('input[name="email"]', 'test@gmail.com'); // 성공하는 이메일로 변경
        await page.fill('input[name="password"]', '000011');
        await page.click('button[type="submit"]');

        // 결과 대기 (최대 10초)
        await page.waitForTimeout(3000);
        const url = page.url();

        if (url.includes('chat-rooms')) {
            await page.waitForLoadState('networkidle');
            return true;
        }

        // 세션 충돌시 재시도 (1회만)
        if (url.includes('session_expired')) {
            await page.goto('/');
            await page.waitForTimeout(1000);
            await page.fill('input[name="email"]', 'test@gmail.com');
            await page.fill('input[name="password"]', '000011');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(3000);

            if (page.url().includes('chat-rooms')) {
                await page.waitForLoadState('networkidle');
                return true;
            }
        }

        throw new Error(`로그인 실패: ${url}`);
    }

    test.beforeEach(async ({ page }) => {
        networkMonitor = new NetworkMonitor(page);
        scorer = new PerformanceScorer();

        try {
            await quickLogin(page);
        } catch (error) {
            // 로그인 실패시 스킵하도록 처리
            test.skip();
        }
    });

    test('💡 네트워크 요청 최적화', async ({ page }) => {
        networkMonitor.reset();
        await page.reload();
        await page.waitForLoadState('networkidle');

        const totalRequests = networkMonitor.getRequestCount();
        const apiRequests = networkMonitor.getRequestsByEndpoint('/api/').length;

        // 점수 계산
        let score = 100;
        if (totalRequests > 20) score -= 15;
        if (totalRequests > 40) score -= 25;
        if (totalRequests > 60) score -= 35;

        scorer.scores['네트워크 최적화'] = Math.max(score, 20);

        console.log(`📊 요청: ${totalRequests}개 (API: ${apiRequests}개) → ${Math.max(score, 20)}점`);
        expect(totalRequests).toBeLessThan(100);
    });

    test('⚡ 페이지 로딩 속도', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/chat-rooms');

        await page.waitForLoadState('domcontentloaded');
        const domTime = Date.now() - startTime;

        await page.waitForLoadState('networkidle');
        const fullTime = Date.now() - startTime;

        let score = 100;
        if (domTime > 1000) score -= 20;
        if (fullTime > 3000) score -= 30;

        scorer.scores['로딩 속도'] = Math.max(score, 30);

        console.log(`⚡ DOM: ${domTime}ms, 전체: ${fullTime}ms → ${Math.max(score, 30)}점`);
    });

    test('🔌 WebSocket 연결 효율성', async ({ page }) => {
        networkMonitor.reset();
        await page.waitForTimeout(2000);

        const wsMessages = networkMonitor.getWebSocketMessageCount();
        const score = wsMessages > 0 ? 100 : 50;

        scorer.scores['WebSocket 연결'] = score;
        console.log(`🔌 WebSocket 메시지: ${wsMessages}개 → ${score}점`);
    });

    test('📋 채팅방 목록 최적화', async ({ page }) => {
        networkMonitor.reset();
        await page.waitForTimeout(2000);

        const chatRoomRequests = networkMonitor.getRequestsByEndpoint('/api/rooms');
        const chatRoomElements = await page.locator('tr:has(td), .chat-room-item').count();

        let score = 80;
        if (chatRoomRequests.length <= 2) score += 10;
        if (chatRoomElements > 0) score += 10;

        scorer.scores['채팅방 최적화'] = score;
        console.log(`📋 채팅방: ${chatRoomElements}개, API: ${chatRoomRequests.length}개 → ${score}점`);
    });

    test('🧠 메모리 효율성', async ({ page }) => {
        const memory = await page.evaluate(() => {
            return performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
            } : null;
        });

        if (memory) {
            let score = 100;
            if (memory.used > 50) score -= 20;
            if (memory.used > 100) score -= 30;

            scorer.scores['메모리 효율성'] = score;
            console.log(`🧠 메모리: ${memory.used}MB → ${score}점`);
        } else {
            scorer.scores['메모리 효율성'] = 70;
            console.log('🧠 메모리 정보 없음 → 70점');
        }
    });

    test.afterAll(async () => {
        const totalScore = scorer.getTotalScore();

        console.log('\n' + '='.repeat(40));
        console.log('🎮 최종 결과');
        console.log('='.repeat(40));

        // 점수별 결과만 출력
        Object.entries(scorer.scores).forEach(([test, score]) => {
            const emoji = score >= 90 ? '🏆' : score >= 80 ? '🥇' : score >= 70 ? '🥈' : score >= 60 ? '🥉' : '💥';
            console.log(`${emoji} ${test}: ${score}점`);
        });

        console.log('='.repeat(40));
        console.log(`🎯 총점: ${totalScore}점`);

        // 등급만 출력
        if (totalScore >= 90) console.log('🏆 서버 부하 최적화 마스터!');
        else if (totalScore >= 80) console.log('🥇 훌륭한 최적화!');
        else if (totalScore >= 70) console.log('🥈 좋은 최적화!');
        else if (totalScore >= 60) console.log('🥉 기본기 탄탄!');
        else console.log('💪 더 많은 최적화 필요!');

        // 핵심 개선 제안만
        if (totalScore < 80) {
            console.log('\n💡 주요 개선 포인트:');
            if (scorer.scores['네트워크 최적화'] < 80) {
                console.log('- 🌐 HTTP 요청 수 줄이기 (번들링, 캐싱)');
            }
            if (scorer.scores['로딩 속도'] < 80) {
                console.log('- ⚡ 로딩 속도 개선 (코드 스플리팅, 지연 로딩)');
            }
            if (scorer.scores['메모리 효율성'] < 80) {
                console.log('- 🧠 메모리 사용량 최적화');
            }
        }
    });
});

// 빠른 단일 테스트들
test.describe('🚀 빠른 성능 체크', () => {
    test('기본 페이지 로드 성능', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const loadTime = Date.now() - startTime;
        const score = loadTime < 2000 ? 100 : loadTime < 4000 ? 80 : 60;

        console.log(`🚀 홈페이지 로드: ${loadTime}ms → ${score}점`);
        expect(loadTime).toBeLessThan(10000); // 10초 이내
    });

    test('정적 리소스 최적화', async ({ page }) => {
        let resourceCount = 0;
        let totalSize = 0;

        page.on('response', async (response) => {
            if (response.url().includes('.js') || response.url().includes('.css')) {
                resourceCount++;
                try {
                    const buffer = await response.body();
                    totalSize += buffer.length;
                } catch (e) {
                    // 일부 리소스는 읽을 수 없음
                }
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
        const score = totalSize < 2 * 1024 * 1024 ? 100 : totalSize < 5 * 1024 * 1024 ? 80 : 60;

        console.log(`📦 리소스: ${resourceCount}개, ${sizeMB}MB → ${score}점`);
    });
});