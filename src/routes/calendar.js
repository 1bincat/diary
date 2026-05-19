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
        diaryMap : {},
      });
    }

    const userId = req.session.user.id;
    const now = new Date();
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;

    // 타임존 및 날짜 밀림을 완전히 방지하기 위해 날짜를 완전히 문자로 강제 고정하여 조회합니다.
    const [rows] = await db.query(
      `SELECT 
         d.id, d.content,
         e.name AS emotion_name,
         e.emoji AS emotion_emoji,
         e.color_code,
         CAST(DATE_FORMAT(d.diary_date, '%Y-%m-%d') AS CHAR) AS diary_date,
         DATE_FORMAT(d.created_at, '%H:%i') AS time,
         COUNT(*) OVER (PARTITION BY d.diary_date, d.emotion_id) AS cnt
       FROM diaries d
       JOIN emotions e ON d.emotion_id = e.id
       WHERE d.user_id = ?
         AND YEAR(d.diary_date) = ?
         AND MONTH(d.diary_date) = ?
       ORDER BY d.diary_date ASC, cnt DESC, d.created_at ASC`,
      [userId, year, month]
    );

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
      diaryMap[dateKey].entries.push({
        diaryId : row.id,
        emoji   : row.emotion_emoji,
        emotion : row.emotion_name,
        content : row.content,
        time    : row.time,
      });
    }

    // 만약 브라우저가 실시간 데이터 갱신을 요청한 경우(Fetch) JSON으로 데이터만 전달
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ diaryMap: diaryMap });
    }

    // 첫 접속 시에는 정상적으로 원래 화면 렌더링
    res.render('calendar', {
      path     : '/calendar',
      user     : req.session.user,
      diaryMap : diaryMap,
    });
  } catch (err) {
    console.error(err);
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(500).json({ error: '서버 오류' });
    }
    res.status(500).send('서버 오류');
  }
});

module.exports = router;