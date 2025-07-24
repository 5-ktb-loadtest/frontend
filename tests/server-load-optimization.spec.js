// tests/server-load-optimization.spec.js - 세션 문제 해결 버전
import { expect, test } from '@playwright/test';
import { NetworkMonitor, PerformanceScorer } from './helpers/network-monitor.js';

test.describe('서버 부하 최적화 테스트', () => {
    let networkMonitor;
    let scorer;

    // 공통 로그인 함수 (세션 처리 개선)
    async function performLogin(page) {
        console.log('🔐 로그인 시작...');

        // 1. 홈페이지로 이동
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 2. 로그인 폼 대기
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        await page.waitForSelector('input[name="password"]', { timeout: 10000 });

        // 3. 로그인 정보 입력
        await page.fill('input[name="email"]', 'test@example.com');
        await page.fill('input[name="password"]', '000011');

        // 4. 네트워크 응답 모니터링
        let loginSuccess = false;
        page.on('response', async (response) => {
            if (response.url().includes('/api/auth/login') || response.url().includes('/login')) {
                console.log(`로그인 응답: ${response.status()}`);
                if (response.status() === 200) {
                    loginSuccess = true;
                    // 응답 데이터 확인
                    try {
                        const responseData = await response.json();
                        console.log('로그인 응답 데이터:', responseData);
                    } catch (e) {
                        console.log('응답 데이터 파싱 실패');
                    }
                }
            }
        });

        // 5. 로그인 버튼 클릭
        await page.click('button[type="submit"]');

        // 6. 로그인 응답 대기
        await page.waitForTimeout(3000);

        // 7. 현재 URL 확인
        const currentUrl = page.url();
        console.log(`로그인 후 현재 URL: ${currentUrl}`);

        // 8. 세션 만료 에러 체크
        if (currentUrl.includes('session_expired')) {
            throw new Error('세션이 만료되었습니다. 백엔드 서버 상태를 확인해주세요.');
        }

        // 9. 로그인 성공 확인
        if (currentUrl.includes('chat-rooms')) {
            console.log('✅ 채팅방 페이지 접근 성공');

            // 10. 페이지가 완전히 로드될 때까지 대기
            await page.waitForLoadState('networkidle');

            // 11. 다시 세션 만료로 리다이렉트되는지 확인
            await page.waitForTimeout(2000);
            const finalUrl = page.url();

            if (finalUrl.includes('session_expired')) {
                throw new Error('로그인 후 세션이 즉시 만료됨. 토큰 저장 문제일 수 있습니다.');
            }

            console.log(`✅ 최종 URL: ${finalUrl}`);
            return true;
        }

        // 12. 로그인 실패 처리
        const errorElement = await page.locator('.error, .alert-danger, [role="alert"]').first().textContent().catch(() => null);
        throw new Error(`로그인 실패. 에러 메시지: ${errorElement || '알 수 없는 오류'}`);
    }

    test.beforeEach(async ({ page }) => {
        networkMonitor = new NetworkMonitor(page);
        scorer = new PerformanceScorer();

        try {
            await performLogin(page);
        } catch (error) {
            console.error('❌ 로그인 실패:', error.message);
            throw error;
        }
    });

    // 간단한 테스트부터 시작
    test('로그인 상태 확인 및 기본 기능 테스트', async ({ page }) => {
        console.log('🧪 기본 기능 테스트 시작');

        // 현재 상태 로깅
        const currentUrl = page.url();
        console.log(`현재 URL: ${currentUrl}`);

        // 세션 만료 체크
        expect(currentUrl).not.toContain('session_expired');
        expect(currentUrl).not.toContain('error=');

        // 페이지 제목 확인
        const title = await page.title();
        console.log(`페이지 제목: ${title}`);

        // 채팅방 관련 요소 확인
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toBeTruthy();

        // 점수 계산
        const score = currentUrl.includes('chat-rooms') ? 100 : 0;
        scorer.scores['로그인 상태 유지'] = score;

        console.log(`✅ 로그인 상태 유지 점수: ${score}점`);
    });

    test('네트워크 요청 최적화 기본 테스트', async ({ page }) => {
        console.log('🌐 네트워크 요청 테스트 시작');

        networkMonitor.reset();

        // 페이지 새로고침으로 요청 수 측정
        await page.reload();
        await page.waitForLoadState('networkidle');

        const requestCount = networkMonitor.getRequestCount();
        console.log(`페이지 로드시 총 요청 수: ${requestCount}개`);

        // 요청 수에 따른 점수 계산
        let score = 0;
        if (requestCount < 10) score = 100;
        else if (requestCount < 20) score = 80;
        else if (requestCount < 30) score = 60;
        else if (requestCount < 50) score = 40;
        else score = 20;

        scorer.scores['네트워크 요청 최적화'] = score;
        console.log(`✅ 네트워크 요청 최적화 점수: ${score}점`);

        expect(requestCount).toBeLessThan(100); // 기본적인 임계치
    });

    test('WebSocket 연결 테스트', async ({ page }) => {
        console.log('🔌 WebSocket 연결 테스트');

        networkMonitor.reset();

        // WebSocket 연결 대기
        await page.waitForTimeout(3000);

        const wsMessages = networkMonitor.getWebSocketMessageCount();
        console.log(`WebSocket 메시지 수: ${wsMessages}개`);

        // WebSocket 연결이 있으면 점수 부여
        const score = wsMessages > 0 ? 100 : 0;
        scorer.scores['WebSocket 연결'] = score;

        console.log(`✅ WebSocket 연결 점수: ${score}점`);
    });

    // 조건부 테스트: 채팅방이 있을 때만 실행
    test('채팅 기능 테스트 (조건부)', async ({ page }) => {
        console.log('💬 채팅 기능 테스트');

        // 채팅방 목록 확인
        const chatRoomSelectors = [
            '.chat-room-item',
            '[data-testid="chat-room"]',
            '.room-item',
            'a[href*="/chat/"]'
        ];

        let chatRoomFound = false;
        let chatRoomElement = null;

        for (const selector of chatRoomSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
                chatRoomElement = page.locator(selector).first();
                chatRoomFound = true;
                console.log(`✅ 채팅방 발견: ${selector}`);
                break;
            }
        }

        if (!chatRoomFound) {
            console.log('⚠️ 채팅방이 없어서 채팅 기능 테스트를 건너뜁니다.');
            scorer.scores['채팅 기능'] = 50; // 중간 점수
            return;
        }

        // 채팅방 클릭
        await chatRoomElement.click();
        await page.waitForLoadState('networkidle');

        // 채팅 입력창 찾기
        const inputSelectors = [
            'textarea[placeholder*="메시지"]',
            'textarea[placeholder*="message"]',
            '.chat-input textarea',
            'textarea'
        ];

        let inputFound = false;
        for (const selector of inputSelectors) {
            const count = await page.locator(selector).count();
            if (count > 0) {
                console.log(`✅ 채팅 입력창 발견: ${selector}`);
                inputFound = true;
                break;
            }
        }

        const score = inputFound ? 100 : 20;
        scorer.scores['채팅 기능'] = score;

        console.log(`✅ 채팅 기능 점수: ${score}점`);
    });

    test.afterAll(async () => {
        scorer.printReport();
    });
});

// 별도의 디버그 테스트 그룹
test.describe('디버그 및 진단', () => {
    test('세션 및 인증 상태 진단', async ({ page }) => {
        console.log('🔍 세션 상태 진단 시작');

        // 홈페이지 접속
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 로컬스토리지 확인
        const localStorage = await page.evaluate(() => {
            const storage = {};
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                storage[key] = window.localStorage.getItem(key);
            }
            return storage;
        });

        console.log('📦 로컬스토리지 내용:', localStorage);

        // 쿠키 확인
        const cookies = await page.context().cookies();
        console.log('🍪 쿠키:', cookies);

        // 로그인 시도
        try {
            await page.fill('input[name="email"]', 'test@example.com');
            await page.fill('input[name="password"]', '000011');
            await page.click('button[type="submit"]');

            // 5초 대기 후 상태 확인
            await page.waitForTimeout(5000);

            const finalUrl = page.url();
            console.log(`🎯 최종 URL: ${finalUrl}`);

            // 로그인 후 로컬스토리지 다시 확인
            const postLoginStorage = await page.evaluate(() => {
                const storage = {};
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    storage[key] = window.localStorage.getItem(key);
                }
                return storage;
            });

            console.log('📦 로그인 후 로컬스토리지:', postLoginStorage);

            // 진단 결과
            if (finalUrl.includes('session_expired')) {
                console.log('❌ 세션 만료 문제 확인됨');
                console.log('💡 해결 방안:');
                console.log('   1. 백엔드 서버 상태 확인');
                console.log('   2. JWT 토큰 만료 시간 확인');
                console.log('   3. 토큰 저장 로직 확인');
            } else if (finalUrl.includes('chat-rooms')) {
                console.log('✅ 로그인 성공');
            }

        } catch (error) {
            console.log(`❌ 로그인 진단 중 오류: ${error.message}`);
        }
    });
});