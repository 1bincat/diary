const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  let streak = 0;
  let stats = { happy: 0, calm: 0, normal: 0, sad: 0, angry: 0 };
  let topEmotion = '-';

  try {
    if (req.session && req.session.user) {
      const userId = req.session.user.id;

      // streak
      const [streakRows] = await db.query(
        'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
        [userId]
      );
      if (streakRows.length > 0) streak = streakRows[0].streak_count;

      // 이번주 월요일 구하기
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const mondayStr = monday.toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);

      // 이번주 감정 통계
      const [statRows] = await db.query(
        `SELECT e.name, COUNT(*) as cnt
         FROM diaries d
         JOIN emotions e ON d.emotion_id = e.id
         WHERE d.user_id = ? AND d.diary_date BETWEEN ? AND ?
         GROUP BY e.name`,
        [userId, mondayStr, todayStr]
      );

      const emotionNameMap = { '행복': 'happy', '평온': 'calm', '무난': 'normal', '슬픔': 'sad', '화남': 'angry' };

      let maxCnt = 0;
      statRows.forEach(row => {
        const key = emotionNameMap[row.name];
        if (key) stats[key] = row.cnt;
        if (row.cnt > maxCnt) {
          maxCnt = row.cnt;
          topEmotion = row.name;
        }
      });
    }
  } catch (err) {
    console.error('홈 조회 실패:', err.message);
  }

  res.render('home', { path: '/', date: `${month}월 ${day}일`, streak, stats, topEmotion });
});

module.exports = router;