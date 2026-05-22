const express = require('express');
const router = express.Router();
const db = require('../config/db');

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

    const [rows] = await db.query(
      `SELECT 
         d.id, d.content, d.file_path,
         d.emotion_id,
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
        diaryId   : row.id,
        emotionId : row.emotion_id,
        emoji     : row.emotion_emoji,
        emotion   : row.emotion_name,
        content   : row.content,
        time      : row.time,
        filePath  : row.file_path || null,
      });
    }

    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ diaryMap });
    }

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
