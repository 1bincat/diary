const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

const uploadDir = 'public/uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

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
      `SELECT d.id, d.content, d.emotion_id, d.file_path, e.emoji, e.name AS emotion_name, 
              DATE_FORMAT(d.created_at, '%H:%i') AS time 
       FROM diaries d 
       JOIN emotions e ON d.emotion_id = e.id 
       WHERE d.user_id = ? AND d.diary_date = ? 
       ORDER BY d.created_at ASC`,
      [dbUserId, displayDate]
    );

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

// [POST] 일기 저장
router.post('/', requireLogin, upload.single('mediaFile'), async (req, res) => {
  const user = req.session.user;
  const { content, emotionId, date } = req.body;
  // file_path를 파일명만 저장 (경로 중복 방지)
  const filePath = req.file ? req.file.filename : null;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    await db.query(
      'INSERT INTO diaries (user_id, emotion_id, diary_date, content, file_path) VALUES (?, ?, ?, ?, ?)',
      [dbUserId, emotionId, date, content, filePath]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [PUT] 일기 수정
router.put('/:id', requireLogin, async (req, res) => {
  const diaryId = req.params.id;
  const { content, emotionId } = req.body;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    const [result] = await db.query(
      'UPDATE diaries SET content = ?, emotion_id = ? WHERE id = ? AND user_id = ?',
      [content, emotionId, diaryId, dbUserId]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({ success: false, error: '권한 없음 또는 존재하지 않는 일기' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [DELETE] 일기 삭제
router.delete('/:id', requireLogin, async (req, res) => {
  const diaryId = req.params.id;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    // 삭제 전 파일 경로 조회 (첨부파일도 함께 삭제)
    const [rows] = await db.query('SELECT file_path FROM diaries WHERE id = ? AND user_id = ?', [diaryId, dbUserId]);
    if (rows.length === 0) {
      return res.status(403).json({ success: false, error: '권한 없음 또는 존재하지 않는 일기' });
    }

    // 첨부파일이 있으면 서버에서도 삭제
    if (rows[0].file_path) {
      const filePath = path.join('public/uploads/', rows[0].file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query('DELETE FROM diaries WHERE id = ? AND user_id = ?', [diaryId, dbUserId]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
