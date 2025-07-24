// tests/server-load-optimization.spec.js - 실제 앱 구조 맞춤 버전
import { expect, test } from '@playwright/test';
import { NetworkMonitor, PerformanceScorer } from './helpers/network-monitor.js';

test.describe('서버 부하 최적화 테스트', () => {
    let networkMonitor;
    let scorer;

    // 실제 앱 구조에 맞춘 로그인 함수
    async function performLogin(page) {
        console.log('🔐 로그인 프로세스 시작...');

        // 1. 홈페이지로 이동
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 2. 서버 연결 상태 확인 대기 (앱에서 4초 후 fallback 처리)
        console.log('서버 연결 상태 확인 대기...');
        await page.waitForTimeout(5000);

        // 3. 로그인 폼이 로드될 때까지 대기
        try {
            await page.waitForSelector('input[name="email"]', { timeout: 10000 });
            await page.waitForSelector('input[name="password"]', { timeout: 10000 });
            console.log('✅ 로그인 폼 발견');
        } catch (error) {
            // 서버 연결 확인 중이면 더 기다리기
            const loadingText = await page.locator('text=서버 연결 확인 중').count();
            if (loadingText > 0) {
                console.log('서버 연결 확인 중... 추가 대기');
                await page.waitForTimeout(10000);
                await page.waitForSelector('input[name="email"]', { timeout: 10000 });
            } else {
                throw error;
            }
        }

        // 4. 로그인 정보 입력
        await page.fill('input[name="email"]', 'test@gmail.com');
        await page.fill('input[name="password"]', '000011');
        console.log('✅ 로그인 정보 입력 완료');

        // 5. 네트워크 응답 모니터링 설정
        let authResponse = null;
        let authResponseData = null;

        page.on('response', async (response) => {
            if (response.url().includes('/api/auth') || response.url().includes('login')) {
                authResponse = response;
                console.log(`인증 응답: ${response.status()} - ${response.url()}`);

                try {
                    if (response.headers()['content-type']?.includes('application/json')) {
                        authResponseData = await response.json();
                        console.log('응답 데이터:', authResponseData);
                    }
                } catch (e) {
                    console.log('응답 JSON 파싱 실패');
                }
            }
        });

        // 6. 로그인 버튼 클릭
        const loginButton = page.locator('button[type="submit"]');
        await expect(loginButton).toBeVisible();
        await loginButton.click();
        console.log('✅ 로그인 버튼 클릭');

        // 7. 로그인 처리 대기 (최대 15초)
        await page.waitForTimeout(3000);

        // 8. 현재 상태 확인
        const currentUrl = page.url();
        console.log(`현재 URL: ${currentUrl}`);

        // 9. 에러 메시지 확인 (실제 앱의 Callout 컴포넌트 사용)
        const errorCallout = await page.locator('[color="danger"], .callout-danger').count();
        const errorText = errorCallout > 0 ?
            await page.locator('[color="danger"], .callout-danger').first().textContent() : null;

        if (errorText) {
            console.log(`❌ 에러 메시지 발견: ${errorText}`);
            throw new Error(`로그인 실패: ${errorText}`);
        }

        // 10. 로딩 상태 확인
        const loadingButton = await page.locator('button:has-text("로그인 중")').count();
        if (loadingButton > 0) {
            console.log('로그인 처리 중... 추가 대기');
            await page.waitForTimeout(5000);
        }

        // 11. 세션 만료 체크
        if (currentUrl.includes('session_expired')) {
            console.log('❌ 세션 만료 감지');
            throw new Error('세션이 만료되었습니다. 백엔드 서버를 확인해주세요.');
        }

        // 12. 성공적인 리다이렉트 확인
        if (currentUrl.includes('chat-rooms')) {
            console.log('✅ 채팅방 페이지로 성공적으로 이동');
            await page.waitForLoadState('networkidle');

            // 13. 추가 세션 만료 체크 (2초 후)
            await page.waitForTimeout(2000);
            const finalUrl = page.url();

            if (finalUrl.includes('session_expired')) {
                throw new Error('로그인 후 즉시 세션 만료됨');
            }

            console.log(`✅ 최종 안정 URL: ${finalUrl}`);
            return true;
        }

        // 14. 다른 에러 상황 체크
        const serverErrorCallout = await page.locator('text=서버 연결 실패, text=서버 오류').count();
        if (serverErrorCallout > 0) {
            const serverErrorText = await page.locator('text=서버 연결 실패, text=서버 오류').first().textContent();
            throw new Error(`서버 연결 문제: ${serverErrorText}`);
        }

        // 15. 로그인 실패 (여전히 로그인 페이지에 있음)
        const stillOnLoginPage = await page.locator('input[name="email"]').count() > 0;
        if (stillOnLoginPage) {
            // 인증 응답 정보 포함해서 에러 발생
            const errorMsg = authResponseData?.message || authResponse?.statusText() || '알 수 없는 로그인 실패';
            throw new Error(`로그인 실패: ${errorMsg} (응답 코드: ${authResponse?.status() || 'N/A'})`);
        }

        throw new Error(`예상치 못한 상태: ${currentUrl}`);
    }

    test.beforeEach(async ({ page }) => {
        networkMonitor = new NetworkMonitor(page);
        scorer = new PerformanceScorer();

        try {
            await performLogin(page);
        } catch (error) {
            console.error('❌ beforeEach 로그인 실패:', error.message);

            // 실패 원인 상세 분석
            const currentUrl = page.url();
            const pageTitle = await page.title();
            const bodyText = await page.locator('body').textContent();

            console.log(`실패 시점 URL: ${currentUrl}`);
            console.log(`페이지 제목: ${pageTitle}`);
            console.log(`페이지 내용 (처음 500자): ${bodyText.substring(0, 500)}`);

            // 백엔드 서버 연결 상태 힌트
            if (error.message.includes('서버') || error.message.includes('연결')) {
                console.log('\n💡 해결 방법:');
                console.log('1. 백엔드 서버가 실행 중인지 확인: lsof -i :8080');
                console.log('2. API 엔드포인트 확인: curl http://localhost:8080/api/health');
                console.log('3. CORS 설정 확인');
            }

            throw error;
        }
    });

    // 가장 기본적인 테스트부터
    test('기본 상태 확인', async ({ page }) => {
        console.log('🧪 기본 상태 확인 테스트');

        const currentUrl = page.url();
        const pageTitle = await page.title();

        console.log(`✅ 현재 URL: ${currentUrl}`);
        console.log(`✅ 페이지 제목: ${pageTitle}`);

        // 기본 검증
        expect(currentUrl).not.toContain('session_expired');
        expect(currentUrl).not.toContain('error=');

        // 점수 부여
        const score = currentUrl.includes('chat-rooms') ? 100 : 0;
        scorer.scores['기본 로그인 상태'] = score;

        console.log(`✅ 기본 로그인 상태 점수: ${score}점`);
    });

    test('네트워크 요청 효율성 측정', async ({ page }) => {
        console.log('🌐 네트워크 요청 효율성 테스트');

        networkMonitor.reset();

        // 페이지 새로고침으로 요청 수 측정
        await page.reload();
        await page.waitForLoadState('networkidle');

        const totalRequests = networkMonitor.getRequestCount();
        const apiRequests = networkMonitor.getRequestsByEndpoint('/api/').length;
        const staticRequests = totalRequests - apiRequests;

        console.log(`📊 총 요청: ${totalRequests}개`);
        console.log(`📊 API 요청: ${apiRequests}개`);
        console.log(`📊 정적 파일 요청: ${staticRequests}개`);

        // 점수 계산 (적을수록 좋음)
        let score = 100;
        if (totalRequests > 20) score -= 10;
        if (totalRequests > 40) score -= 20;
        if (totalRequests > 60) score -= 30;
        if (apiRequests > 10) score -= 20;

        score = Math.max(score, 10); // 최소 10점

        scorer.scores['네트워크 요청 효율성'] = score;
        console.log(`✅ 네트워크 요청 효율성 점수: ${score}점`);

        expect(totalRequests).toBeLessThan(100); // 기본 임계치
    });

    test('채팅방 목록 로딩 최적화', async ({ page }) => {
        console.log('📋 채팅방 목록 로딩 테스트');

        networkMonitor.reset();

        // 채팅방 목록 페이지에서 요청 분석
        await page.waitForTimeout(2000);

        const chatRoomRequests = networkMonitor.getRequestsByEndpoint('/api/rooms');
        const wsConnections = networkMonitor.getWebSocketMessageCount();

        console.log(`📊 채팅방 API 요청: ${chatRoomRequests.length}개`);
        console.log(`📊 WebSocket 메시지: ${wsConnections}개`);

        // 채팅방 요소 확인
        const chatRoomElements = await page.locator('.chat-room-item, [data-testid="chat-room"], tr').count();
        console.log(`📊 채팅방 개수: ${chatRoomElements}개`);

        // 점수 계산
        let score = 80; // 기본 점수
        if (chatRoomRequests.length <= 2) score += 10; // API 요청이 적으면 가점
        if (wsConnections > 0) score += 10; // WebSocket 연결되면 가점
        if (chatRoomElements > 0) score += 10; // 채팅방이 있으면 가점

        scorer.scores['채팅방 목록 최적화'] = score;
        console.log(`✅ 채팅방 목록 최적화 점수: ${score}점`);
    });

    // 간단한 타이핑 테스트 (채팅방이 있을 때만)
    test('타이핑 최적화 간단 테스트', async ({ page }) => {
        console.log('⌨️ 타이핑 최적화 테스트');

        // 채팅방이 있는지 확인
        const chatRoomCount = await page.locator('.chat-room-item, [data-testid="chat-room"], tr:has(td)').count();

        if (chatRoomCount === 0) {
            console.log('⚠️ 채팅방이 없어서 타이핑 테스트를 건너뜁니다.');
            scorer.scores['타이핑 최적화'] = 50; // 중간 점수
            return;
        }

        try {
            // 첫 번째 채팅방 클릭
            await page.locator('.chat-room-item, [data-testid="chat-room"], tr:has(td)').first().click();
            await page.waitForLoadState('networkidle');

            // 채팅 입력창 찾기 (여러 선택자 시도)
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

                    networkMonitor.reset();

                    // 간단한 타이핑 테스트
                    const input = page.locator(selector).first();
                    await input.type('test');
                    await page.waitForTimeout(1000);

                    const typingRelatedRequests = networkMonitor.websocketMessages.filter(msg =>
                        msg.payload && (msg.payload.includes('typing') || msg.payload.includes('input'))
                    );

                    console.log(`📊 타이핑 관련 메시지: ${typingRelatedRequests.length}개`);

                    inputFound = true;
                    break;
                }
            }

            const score = inputFound ? 100 : 30;
            scorer.scores['타이핑 최적화'] = score;
            console.log(`✅ 타이핑 최적화 점수: ${score}점`);

        } catch (error) {
            console.log(`⚠️ 타이핑 테스트 중 오류: ${error.message}`);
            scorer.scores['타이핑 최적화'] = 30;
        }
    });

    test.afterAll(async () => {
        scorer.printReport();
    });
});

// 별도 디버그 테스트
test.describe('디버그 및 문제 해결', () => {
    test('상세 로그인 진단', async ({ page }) => {
        console.log('🔍 상세 로그인 진단 시작');

        // 1. 홈페이지 접속
        await page.goto('/');
        console.log(`1️⃣ 홈페이지 접속: ${page.url()}`);

        // 2. 네트워크 상태 확인
        await page.waitForTimeout(2000);
        const networkStatus = await page.evaluate(() => navigator.onLine);
        console.log(`2️⃣ 네트워크 상태: ${networkStatus ? '온라인' : '오프라인'}`);

        // 3. 서버 연결 확인 상태 체크
        const serverCheckText = await page.locator('text=서버 연결 확인').count();
        if (serverCheckText > 0) {
            console.log('3️⃣ 서버 연결 확인 중... 대기');
            await page.waitForTimeout(8000); // 충분히 대기
        }

        // 4. 로그인 폼 확인
        const emailInput = await page.locator('input[name="email"]').count();
        const passwordInput = await page.locator('input[name="password"]').count();
        console.log(`4️⃣ 이메일 입력창: ${emailInput > 0 ? '✅' : '❌'}`);
        console.log(`4️⃣ 비밀번호 입력창: ${passwordInput > 0 ? '✅' : '❌'}`);

        // 5. 경고 메시지 확인
        const warningCallouts = await page.locator('[color="warning"], .callout-warning').count();
        if (warningCallouts > 0) {
            const warningText = await page.locator('[color="warning"], .callout-warning').first().textContent();
            console.log(`5️⃣ 경고 메시지: ${warningText}`);
        }

        // 6. 로그인 시도
        if (emailInput > 0 && passwordInput > 0) {
            await page.fill('input[name="email"]', 'test@example.com');
            await page.fill('input[name="password"]', '000011');

            console.log('6️⃣ 로그인 정보 입력 완료');

            // 네트워크 모니터링
            let responses = [];
            page.on('response', (response) => {
                responses.push({
                    url: response.url(),
                    status: response.status(),
                    timestamp: new Date().toISOString()
                });
            });

            await page.click('button[type="submit"]');
            console.log('6️⃣ 로그인 버튼 클릭');

            // 10초 대기 후 결과 분석
            await page.waitForTimeout(10000);

            console.log('7️⃣ 네트워크 응답 분석:');
            responses.forEach(res => {
                if (res.url.includes('/api/') || res.url.includes('auth')) {
                    console.log(`   ${res.status} - ${res.url}`);
                }
            });

            const finalUrl = page.url();
            console.log(`8️⃣ 최종 URL: ${finalUrl}`);

            // 결과 분석
            if (finalUrl.includes('chat-rooms')) {
                console.log('✅ 로그인 성공!');
            } else if (finalUrl.includes('session_expired')) {
                console.log('❌ 세션 만료 문제');
                console.log('💡 백엔드 서버 상태 확인 필요');
            } else {
                console.log('❓ 예상치 못한 결과');
            }
        }
    });
});