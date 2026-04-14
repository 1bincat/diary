const express = require('express');
const router = express.Router();
const db = require('../config/db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

/**
 * 연속 기록(Streak) 업데이트 함수
 * @param {number} dbUserId - 유저 고유 ID
 * @param {string} targetDate - 저장되는 일기 날짜 (YYYY-MM-DD)
 */
async function updateStreak(dbUserId, targetDate) {
  try {
    // 1. 해당 유저의 가장 최근 스트릭 기록 가져오기
    const [rows] = await db.query(
      'SELECT streak_count, DATE_FORMAT(streak_date, "%Y-%m-%d") as last_date FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );

    let newCount = 1;

    if (rows.length > 0) {
      const lastDate = rows[0].last_date;
      
      // 이미 오늘 기록을 했다면 카운트 유지
      if (lastDate === targetDate) return;

      // 어제 날짜 계산
      const prevDay = new Date(targetDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().split('T')[0];

      // 마지막 기록이 어제라면 카운트 + 1, 아니면 1로 리셋
      if (lastDate === prevDayStr) {
        newCount = rows[0].streak_count + 1;
      }
    }

    // 2. 스트릭 정보 저장 (이미 오늘 날짜 데이터가 있으면 업데이트, 없으면 삽입)
    await db.query(
      `INSERT INTO streak_logs (user_id, streak_count, streak_date) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE streak_count = ?`,
      [dbUserId, newCount, targetDate, newCount]
    );
    
    console.log(`스트릭 업데이트 완료: 유저 ${dbUserId}, 카운트 ${newCount}`);
  } catch (err) {
    console.error('스트릭 업데이트 오류:', err);
  }
}

// [GET] 작성 페이지 조회
router.get('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  
  const now = new Date();
  const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const todayStr = kstDate.toISOString().split('T')[0];

  const displayDate = req.query.date || todayStr;
  const selectedEmotionFromUrl = req.query.emotion || 0;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    const dbUserId = userRows[0].id;

    const [diaries] = await db.query(
      `SELECT d.id, d.content, d.emotion_id, e.emoji, e.name as emotion_name, 
              DATE_FORMAT(d.created_at, "%H:%i") as time 
       FROM diaries d 
       JOIN emotions e ON d.emotion_id = e.id
       WHERE d.user_id = ? AND d.diary_date = ? 
       ORDER BY d.created_at ASC`,
      [dbUserId, displayDate]
    );

    // 가장 최근 스트릭 정보 하나만 가져오기
    const [streakRows] = await db.query(
      'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );

    res.render('write', { 
      path: '/write', 
      diaries, 
      streak: streakRows.length > 0 ? streakRows[0].streak_count : 0, 
      selectedEmotion: parseInt(selectedEmotionFromUrl), 
      displayDate 
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// [POST] 일기 저장 및 스트릭 업데이트
router.post('/', requireLogin, async (req, res) => {
  const user = req.session.user;
  const { content, emotionId, date } = req.body;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: '유저 없음' });
    
    const dbUserId = userRows[0].id;

    // 1. 일기 저장
    await db.query(
      'INSERT INTO diaries (user_id, emotion_id, diary_date, content) VALUES (?, ?, ?, ?)',
      [dbUserId, emotionId, date, content]
    );

    // 2. 스트릭 업데이트 호출 (★ 이 부분이 추가되어야 기록 시 카운트가 올라감)
    await updateStreak(dbUserId, date);

    res.json({ success: true });
  } catch (err) {
    console.error('DB 저장 중 에러:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [PUT] 일기 수정
router.put('/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    const [result] = await db.query(
      'UPDATE diaries SET content = ? WHERE id = ? AND user_id = ?',
      [content, id, dbUserId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '일기 없음' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [DELETE] 일기 삭제
router.delete('/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    const [result] = await db.query(
      'DELETE FROM diaries WHERE id = ? AND user_id = ?',
      [id, dbUserId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '일기 없음' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;