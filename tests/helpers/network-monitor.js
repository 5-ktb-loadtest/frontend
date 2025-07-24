export class NetworkMonitor {
    constructor(page) {
        this.page = page;
        this.requests = [];
        this.websocketMessages = [];

        // HTTP 요청 모니터링
        page.on('request', (request) => {
            this.requests.push({
                url: request.url(),
                method: request.method(),
                timestamp: Date.now(),
                headers: request.headers()
            });
        });

        // WebSocket 메시지 모니터링
        page.on('websocket', (ws) => {
            ws.on('framesent', (event) => {
                this.websocketMessages.push({
                    type: 'sent',
                    payload: event.payload,
                    timestamp: Date.now()
                });
            });

            ws.on('framereceived', (event) => {
                this.websocketMessages.push({
                    type: 'received',
                    payload: event.payload,
                    timestamp: Date.now()
                });
            });
        });
    }

    getRequestCount() {
        return this.requests.length;
    }

    getWebSocketMessageCount() {
        return this.websocketMessages.length;
    }

    getRequestsByEndpoint(endpoint) {
        return this.requests.filter(req => req.url.includes(endpoint));
    }

    reset() {
        this.requests = [];
        this.websocketMessages = [];
    }
}

// 성능 점수 계산기
export class PerformanceScorer {
    constructor() {
        this.scores = {};
        this.maxScore = 100;
    }

    calculateTypingScore(actualEvents, maxExpected) {
        const efficiency = Math.max(0, (maxExpected - actualEvents) / maxExpected);
        return Math.round(efficiency * 100);
    }

    calculateBatchScore(actualRequests, messagesCount) {
        const idealBatches = Math.ceil(messagesCount / 5);
        const efficiency = idealBatches / actualRequests;
        return Math.round(Math.min(efficiency, 1) * 100);
    }

    calculateMemoryScore(increasePercentage) {
        if (increasePercentage < 10) return 100;
        if (increasePercentage < 25) return 80;
        if (increasePercentage < 50) return 60;
        return 30;
    }

    calculateResponseTimeScore(avgResponseTime) {
        if (avgResponseTime < 500) return 100;
        if (avgResponseTime < 1000) return 80;
        if (avgResponseTime < 2000) return 60;
        return 30;
    }

    getTotalScore() {
        const scores = Object.values(this.scores);
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 0;
    }

    printReport() {
        console.log('\n🎮 서버 부하 최적화 게임 결과 🎮');
        console.log('=====================================');
        Object.entries(this.scores).forEach(([test, score]) => {
            const grade = score >= 90 ? '🏆' : score >= 80 ? '🥇' : score >= 70 ? '🥈' : score >= 60 ? '🥉' : '💥';
            console.log(`${grade} ${test}: ${score}점`);
        });
        console.log('=====================================');
        console.log(`🎯 총점: ${this.getTotalScore()}점`);

        const totalScore = this.getTotalScore();
        if (totalScore >= 90) console.log('🏆 서버 부하 최적화 마스터!');
        else if (totalScore >= 80) console.log('🥇 훌륭한 최적화 실력!');
        else if (totalScore >= 70) console.log('🥈 좋은 최적화 감각!');
        else if (totalScore >= 60) console.log('🥉 기본기는 탄탄!');
        else console.log('💪 더 많은 최적화가 필요해요!');
    }
}