const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const isLoggedIn = req.session && req.session.user;

    if (!isLoggedIn) {
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
         d.id, d.content,
         e.name AS emotion_name,
         e.emoji AS emotion_emoji,
         e.color_code,
         DATE_FORMAT(d.diary_date, '%Y-%m-%d') AS diary_date,
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
      if (!diaryMap[row.diary_date]) {
        diaryMap[row.diary_date] = {
          emoji     : row.emotion_emoji,
          emotion   : row.emotion_name,
          colorCode : row.color_code,
          entries   : [],
        };
      }
      diaryMap[row.diary_date].entries.push({
        diaryId : row.id,
        emoji   : row.emotion_emoji,
        emotion : row.emotion_name,
        content : row.content,
        time    : row.time,
      });
    }

    res.render('calendar', {
      path     : '/calendar',
      user     : req.session.user,
      diaryMap : diaryMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('서버 오류');
  }
});

module.exports = router;