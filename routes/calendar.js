const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 달력 페이지 렌더링 및 실시간 데이터 조회를 모두 처리하는 라우터
router.get('/', async (req, res) => {
  try {
    const isLoggedIn = req.session && req.session.user;

    if (!isLoggedIn) {
      if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ diaryMap: {} });
      }
      return res.render('calendar', {
        path     : '/calendar',
        user     : null,
        diaryMap : { },
      });
    }

    const userId = req.session.user.id;
    const now = new Date();
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;

    // 🚀 d.file_path 컬럼을 확실하게 select 하여 데이터베이스에서 추출합니다.
    const [rows] = await db.query(
      `SELECT 
         d.id, d.content, d.emotion_id, d.file_path,
         e.name AS emotion_name,
         e.emoji AS emotion_emoji,
         e.color_code,
         CAST(DATE_FORMAT(d.diary_date, '%Y-%m-%d') AS CHAR) AS diary_date,
         DATE_FORMAT(d.created_at, '%H:%i') AS time
       FROM diaries d
       JOIN emotions e ON d.emotion_id = e.id
       WHERE d.user_id = ?
         AND YEAR(d.diary_date) = ?
         AND MONTH(d.diary_date) = ?
       ORDER BY d.diary_date ASC, d.created_at ASC`,
      [userId, year, month]
    );

    // calendar.js 내부 DB 데이터 파싱 loop 영역
    const diaryMap = {};
    for (const row of rows) {
      const dateKey = row.diary_date.trim(); 
      if (!diaryMap[dateKey]) {
        diaryMap[dateKey] = {
          emoji     : row.emotion_emoji,
          emotion   : row.emotion_name,
          colorCode : row.color_code,
          entries   : [],
        };
      }

      // 🚀 [파일명 정밀 정제]: 공백 제거 및 빈 값 필터링
      const filePathsArray = row.file_path ? row.file_path.split(',').map(f => f.trim()).filter(Boolean) : [];

      // 🚀 [핵심 교정]: calendar.ejs 명세서와 100% 호환되도록 단수형, 복수형 변수명을 모두 제공하여 붕괴 방지!
      diaryMap[dateKey].entries.push({
        diaryId   : row.id,
        emotionId : row.emotion_id, 
        emoji     : row.emotion_emoji,
        emotion   : row.emotion_name,
        content   : row.content,
        time      : row.time,
        file_path : row.file_path,       // 1. 원본 문자열 형태 복원 (,로 연결된 상태)
        filePath  : row.file_path,       // 2. 카멜케이스 단수형 복원
        file_paths: filePathsArray,      // 3. 오늘 개조한 배열 형태 (가로 스크롤 루프용)
        filePaths : filePathsArray       // 4. 카멜케이스 배열 형태
      });
    }

    // 만약 브라우저가 실시간 데이터 갱신을 요청한 경우(Fetch) JSON으로 데이터만 전달
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ diaryMap: diaryMap });
    }

    // 일반 페이지 요청 시 EJS 템플릿 엔진 렌더링
    res.render('calendar', {
      path     : '/calendar',
      user     : req.session.user,
      diaryMap : diaryMap,
    });

  } catch (err) {
    console.error('캘린더 데이터 로딩 중 서버 에러 발생:', err);
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({ error: '서버 에러가 발생했습니다.' });
    }
    res.status(500).send('서버 내부 에러 발생');
  }
});

module.exports = router;