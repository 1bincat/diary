const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

/**
 * 연속 기록(Streak) 업데이트 함수
 */
async function updateStreak(dbUserId, today) {
  try {
    const [rows] = await db.query(
      'SELECT streak_count, streak_date FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );

    let newCount = 1;

    if (rows.length > 0) {
      const lastDate = new Date(rows[0].streak_date).toISOString().slice(0, 10);
      
      if (lastDate === today) {
        return;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (lastDate === yesterdayStr) {
        newCount = rows[0].streak_count + 1;
      } else {
        newCount = 1;
      }
    }

    await db.query(
      'INSERT INTO streak_logs (user_id, streak_count, streak_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE streak_count = ?',
      [dbUserId, newCount, today, newCount]
    );
  } catch (err) {
    console.error('스트릭 업데이트 중 오류 발생:', err);
  }
}

// GET 요청 부분
router.get('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  const selectedEmotionFromUrl = req.query.emotion || 0; 
  let userStreak = 0; 

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    if (userRows.length === 0) return res.redirect('/');
    const dbUserId = userRows[0].id;

    const [streakRows] = await db.query(
      'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );
    if (streakRows.length > 0) userStreak = streakRows[0].streak_count;

    const [diaries] = await db.query(
      'SELECT *, DATE_FORMAT(created_at, "%H:%i") as time FROM diaries WHERE user_id = ? AND diary_date = ? ORDER BY created_at ASC',
      [dbUserId, today]
    );

    res.render('write', { 
      path: '/write', diaries, streak: userStreak, 
      selectedEmotion: parseInt(selectedEmotionFromUrl)
    });
  } catch (err) {
    console.error('GET /write 오류:', err);
    res.redirect('/');
  }
});

// POST 요청
router.post('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  const { content, emotionId } = req.body;

  if (!content || !emotionId) {
    return res.status(400).json({ success: false, message: '내용 또는 감정 ID가 누락되었습니다.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    const dbUserId = userRows[0].id;

    await db.query(
      'INSERT INTO diaries (user_id, emotion_id, diary_date, content) VALUES (?, ?, ?, ?)',
      [dbUserId, emotionId, today, content]
    );

    await updateStreak(dbUserId, today);

    return res.json({ success: true });

  } catch (err) {
    console.error('DB 저장 중 치명적 오류 발생:', err);
    return res.status(500).json({ 
      success: false, 
      message: '서버 내부 DB 오류가 발생했습니다.',
      error: err.message 
    });
  }
});

module.exports = router;