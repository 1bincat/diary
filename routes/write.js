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

// 최대 5개 다중 파일 업로드 제한 플러그인 세팅
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
  
  // 🚀 [수정 기능 전면 복구 핵심]: URL 주소창 뒤에 붙어 넘어온 editId 쿼리를 캐치합니다!
  const editId = req.query.editId || null;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    const dbUserId = userRows[0].id;

    // 1. 오늘의 타임라인 일기 목록 조회
    const [rows] = await db.query(
      `SELECT d.id, d.content, d.emotion_id, d.file_path, e.emoji, e.name AS emotion_name, 
              DATE_FORMAT(d.created_at, '%H:%i') AS time 
       FROM diaries d 
       JOIN emotions e ON d.emotion_id = e.id 
       WHERE d.user_id = ? AND d.diary_date = ? 
       ORDER BY d.created_at ASC`,
      [dbUserId, displayDate]
    );

    const diaries = rows.map(row => ({
      id: row.id,
      content: row.content,
      emotion_id: row.emotion_id,
      file_path: row.file_path,
      emoji: row.emoji,
      emotion_name: row.emotion_name,
      time: row.time,
      file_paths: row.file_path ? row.file_path.split(',') : []
    }));

    // 🚀 [수정 기능 전면 복구 핵심]: 만약 캘린더에서 수정하기를 누르고 넘어왔다면(editId가 존재하면)
    // 현재 수정하고자 하는 타겟 일기의 기존 본문 내용과 감정 상태(editData)를 정밀 역추적하여 가져옵니다.
    let editData = null;
    if (editId) {
      const [editRows] = await db.query(
        'SELECT id, content, emotion_id, file_path FROM diaries WHERE id = ? AND user_id = ?',
        [editId, dbUserId]
      );
      if (editRows.length > 0) {
        editData = editRows[0];
      }
    }

    // 2. 연속 기록 스트릭 로그 조회
    const [streakRows] = await db.query(
      'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );

    // 🚀 [최종 바인딩]: 화면 엔진(EJS)으로 editData를 안전하게 배달합니다.
    res.render('write', { 
      path: '/write', 
      diaries, 
      editData, // 👈 백엔드가 조율해 낸 수정 데이터 전송
      streak: streakRows.length > 0 ? streakRows[0].streak_count : 0, 
      selectedEmotion: parseInt(selectedEmotionFromUrl), 
      displayDate 
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// [POST] 일기 저장 (최대 5개 멀티 파일 업로드)
router.post('/', requireLogin, upload.array('mediaFiles', 5), async (req, res) => {
  const user = req.session.user;
  const { content, emotionId, date } = req.body;
  
  let filePathString = null;
  if (req.files && req.files.length > 0) {
    filePathString = req.files.map(file => file.filename).join(',');
  }

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    await db.query(
      'INSERT INTO diaries (user_id, emotion_id, diary_date, content, file_path) VALUES (?, ?, ?, ?, ?)',
      [dbUserId, emotionId, date, content, filePathString]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// [PUT] 일기 수정 (다중 첨부파일 유지 및 추가 병합)
router.put('/:id', requireLogin, upload.array('mediaFiles', 5), async (req, res) => {
  const diaryId = req.params.id;
  const { content, emotionId, keptFiles } = req.body;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    let finalFiles = keptFiles ? keptFiles.split(',').filter(Boolean) : [];

    if (req.files && req.files.length > 0) {
      req.files.forEach(file => finalFiles.push(file.filename));
    }

    const filePathString = finalFiles.length > 0 ? finalFiles.join(',') : null;

    const [result] = await db.query(
      'UPDATE diaries SET content = ?, emotion_id = ?, file_path = ? WHERE id = ? AND user_id = ?',
      [content, emotionId, filePathString, diaryId, dbUserId]
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

// [DELETE] 일기 삭제 (다중 파일 일괄 소멸 처리)
router.delete('/:id', requireLogin, async (req, res) => {
  const diaryId = req.params.id;
  const user = req.session.user;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    const [rows] = await db.query('SELECT file_path FROM diaries WHERE id = ? AND user_id = ?', [diaryId, dbUserId]);
    if (rows.length === 0) {
      return res.status(403).json({ success: false, error: '권한 없음 또는 존재하지 않는 일기' });
    }

    if (rows[0].file_path) {
      const allFiles = rows[0].file_path.split(',');
      allFiles.forEach(file => {
        const filePath = path.join('public/uploads/', file.trim());
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    await db.query('DELETE FROM diaries WHERE id = ? AND user_id = ?', [diaryId, dbUserId]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;