const express = require('express');
const router = express.Router();
const db = require('../config/db');
// Google Gen AI 공식 SDK 라이브러리 로드
const { GoogleGenAI } = require('@google/genai');

// 환경변수에 등록된 API Key를 기반으로 인스턴스 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 🚀 [주차 계산 유틸리티 함수] 현재 날짜가 해당 월의 몇째 주인지 계산 (%Y년 %m월 %d째주 형식 반환)
function getWeekOfMonth(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const currentDate = date.getUTCDate();
  
  // 해당 월의 1일이 무슨 요일인지 계산 (0: 일요일, 1: 월요일 ... 6: 토요일)
  const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  
  // 1일의 요일 가중치와 현재 일자를 합산하여 7로 나눈 올림값 계산
  const weekNum = Math.ceil((currentDate + firstDayOfWeek) / 7);
  
  return `${month}월 ${weekNum}주차`;
}

// [GET] 홈 화면 조회
router.get('/', async (req, res) => {
  // 한국 시간(KST) 기준으로 안전하게 현재 날짜 계산 (시차 오류 전면 차단)
  const nowKST = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  
  // 🚀 기존 '월 일' 문자열 대신 주차 계산 함수 적용 ("5월 4째주" 형식 추출)
  const weekDisplayStr = getWeekOfMonth(nowKST);

  let streak = 0;
  let stats = { happy: 0, calm: 0, normal: 0, sad: 0, angry: 0 };
  let topEmotion = '-';
  let topEmotionKey = 'normal'; // 기본값 설정

  // AI 추천 데이터 기본 Fallback 객체
  let aiRecommendation = {
    message: '오늘 하루는 어떤 마음이었나요? 편안하게 일기를 적어보세요.',
    action: '가볍게 스트레칭 하기',
    music: '내 마음이 편안해지는 음악'
  };

  try {
    if (req.session && req.session.user) {
      const userId = req.session.user.id;

      // 1. 스트릭 조회
      const [streakRows] = await db.query(
        'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
        [userId]
      );
      if (streakRows.length > 0) streak = streakRows[0].streak_count;

      // 2. KST 기준 이번 주 월요일 및 오늘 날짜 문자열 계산 (%Y-%m-%d)
      const currentDay = nowKST.getUTCDay(); // 0: 일, 1: 월, ..., 6: 토
      const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
      
      const monday = new Date(nowKST.getTime() - (daysSinceMonday * 24 * 60 * 60 * 1000));
      const mondayStr = monday.toISOString().slice(0, 10);
      const todayStr = nowKST.toISOString().slice(0, 10);

      // 3. 이번 주 감정 통계 조회
      const [statRows] = await db.query(
        `SELECT e.name, COUNT(*) as cnt
         FROM diaries d
         JOIN emotions e ON d.emotion_id = e.id
         WHERE d.user_id = ? AND d.diary_date BETWEEN ? AND ?
         GROUP BY e.name`,
        [userId, mondayStr, todayStr]
      );

      const emotionNameMap = { '행복': 'happy', '평온': 'calm', '무난': 'normal', '무난/보통': 'normal', '보통': 'normal', '슬픔': 'sad', '화남': 'angry' };

      let maxCnt = 0;
      
      // 먼저 통계 데이터 구조를 stats 오브젝트에 맵핑
      statRows.forEach(row => {
        const key = emotionNameMap[row.name];
        if (key) {
          stats[key] = row.cnt;
        }
      });

      // 매핑된 결과를 바탕으로 가장 높은 빈도의 감정을 정확하게 판단 (동률 및 기본값 예외 처리 강화)
      const emotionKoreanMap = { happy: '행복', calm: '평온', normal: '보통', sad: '슬픔', angry: '화남' };
      
      Object.keys(stats).forEach(key => {
        if (stats[key] > maxCnt) {
          maxCnt = stats[key];
          topEmotionKey = key;
          topEmotion = emotionKoreanMap[key];
        }
      });

      // 이번 주 기록이 존재한다면 최다 감정 정보를 한글 이름으로 매칭
      if (maxCnt > 0) {
        topEmotion = emotionKoreanMap[topEmotionKey];
      } else {
        topEmotion = '데이터 없음';
      }

      // 🎯 [home.js] 통계 1위 감정을 기반으로 Gemini AI 힐링 추천 데이터 바인딩 구역
      const emotionKorean = emotionKoreanMap[topEmotionKey]; 
      
      const promptMessage = `
        사용자가 이번 주에 가장 많이 느낀 전반적인 기분은 [${emotionKorean}] 입니다. 
        이번 주 통계 1위 기분에 맞춰 이 사용자의 마음을 케어해줄 힐링 데이터(오늘의 한마디: message, 추천 행동: action, 추천 음악: music)를 생성해주세요.
        
        ★ 🚨 [초중요 글자 수 제한 제약 조건] 🚨
        - '오늘의 한마디(message)'와 '추천 행동(action)'은 줄바꿈 없이, 문장 전체의 길이를 반드시 공백 포함 "20자 이내"로 아주 짧고 강렬하게 요약하세요.
        - 예: "오늘 밤은 푹 쉬어도 괜찮아요." (16자 - 통과)
        
        ★ 오늘의 한마디(message) 주의사항:
        - "오늘도 힘내세요" 같은 뻔한 매크로식 위로는 절대 금지합니다.
        - 감각적인 비유 문체를 채택하여 짧지만 깊은 울림을 주세요.
        
        ★ 음악 추천(music) 주의사항:
        - 너무 유명한 대중가요는 피하고 인디, 재즈, 시티팝, 클래식, 로파이(Lo-Fi) 등 숨은 명곡 리스트를 발굴하세요.
      `;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptMessage,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.95,
            responseSchema: {
              type: 'OBJECT',
              properties: {
                message: { type: 'STRING', description: '가이드라인에 맞춘 신선한 오늘의 한마디' },
                action: { type: 'STRING', description: '현실적이고 구체적인 추천 행동' },
                music: { type: 'STRING', description: '아티스트 - 노래 제목 형식의 숨은 명곡 추천' }
              },
              required: ['message', 'action', 'music']
            }
          }
        });

        const cleanText = response.text.trim();
        aiRecommendation = JSON.parse(cleanText);
      } catch (aiErr) {
        console.error('서버 사이드 Gemini 추천 실패:', aiErr);
      }
    }
  } catch (err) {
    console.error('홈 조회 실패:', err.message);
  }

  res.render('home', { 
    path: '/', 
    date: weekDisplayStr, // 🚀 "5월 28일" 대신 새롭게 구한 "5월 4째주" 주차 문자열 바인딩!
    streak,
    stats,
    topEmotion,
    aiRecommendation
  });
});

module.exports = router;