const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

router.get('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  const kstDate = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const todayStr = kstDate.toISOString().split('T')[0];
  const yesterdayStr = new Date(kstDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const displayDate = req.query.date || todayStr;
  const selectedEmotionFromUrl = req.query.emotion || 0;
  const editId = req.query.editId || null;

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    const dbUserId = userRows[0].id;

    const [rows] = await db.query(
      `SELECT d.id, d.content, d.emotion_id, d.file_path, d.ai_message, d.ai_action, d.ai_music,
              e.emoji, e.name AS emotion_name, 
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
      ai_message: row.ai_message,
      ai_action: row.ai_action,
      ai_music: row.ai_music,
      emoji: row.emoji,
      emotion_name: row.emotion_name,
      time: row.time,
      file_paths: row.file_path ? row.file_path.split(',') : []
    }));

    let editData = null;
    if (editId) {
      const [editRows] = await db.query(
        'SELECT id, content, emotion_id, file_path FROM diaries WHERE id = ? AND user_id = ?',
        [editId, dbUserId]
      );
      if (editRows.length > 0) editData = editRows[0];
    }

    const [streakRows] = await db.query(
      'SELECT streak_count, streak_date FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );

    let streak = 0;
    let streakBroken = false;
    if (streakRows.length > 0) {
      const lastDateStr = new Date(streakRows[0].streak_date).toISOString().slice(0, 10);
      if (lastDateStr === todayStr || lastDateStr === yesterdayStr) {
        streak = streakRows[0].streak_count;
      } else {
        streakBroken = true;
      }
    }

    res.render('write', { 
      path: '/write', 
      diaries, 
      editData, 
      streak,
      streakBroken,
      selectedEmotion: parseInt(selectedEmotionFromUrl), 
      displayDate 
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

router.post('/', requireLogin, upload.array('mediaFiles'), async (req, res) => {
  const user = req.session.user;
  const { content, emotionId, date } = req.body;
  
  let filePathString = null;
  if (req.files && req.files.length > 0) {
    filePathString = req.files.map(file => file.filename).join(',');
  }

  try {
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [user.userId]);
    const dbUserId = userRows[0].id;

    const emotionIdMap = { 1: '행복', 2: '평온', 3: '보통', 4: '슬픔', 5: '분노' };
    const emotionKorean = emotionIdMap[emotionId] || '보통';

    let aiRecommendation = {
      message: `소중한 [${emotionKorean}] 기분을 기록해 주셔서 감사해요.`,
      action: '따뜻한 물 한 잔 마시며 창밖 바라보기',
      music: '내 마음에 안정을 주는 Lo-Fi 연주곡'
    };

    const promptMessage = `
      사용자가 방금 일기를 제출했습니다. 선택한 감정은 [${emotionKorean}] 이며, 본문 내용은 다음과 같습니다: "${content}"
      본문 내용과 감정에 깊이 공감하고 위로해줄 힐링 데이터(오늘의 한마디: message, 추천 행동: action, 추천 음악: music)를 JSON 형식으로 생성해주세요.

      ★ 🚨 [초중요 글자 수 제한 규칙] 🚨
      - '오늘의 한마디(message)'와 '추천 행동(action)'은 문장 전체의 길이를 반드시 공백을 포함하여 "20자 이내"로 아주 짧고 명료하게 작성하세요.
      - 20자가 초과되는 긴 설명형 문장은 절대 전송하지 마세요.
      - 예: "오늘 밤은 푹 쉬어도 괜찮아요." (16자 - 통과)

      ★ 오늘의 한마디(message) 주의사항:
      - "오늘도 힘내세요", "기운 내세요" 같은 진부한 고정 멘트는 절대 금지합니다.
      - 감각적인 비유나 심리학적 공감을 담아 짧지만 깊은 여운을 주는 독창적인 멘트를 하세요.

      ★ 음악 추천(music) 주의사항:
      - 인디, 재즈, 시티팝, 클래식, 로파이(Lo-Fi) 등 숨겨진 명곡 위주로 선정하세요.
      - 반드시 '아티스트 - 노래 제목' 형식으로만 깔끔하게 출력하세요.
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
              message: { type: 'STRING', description: '20자 이내의 독창적인 격려와 공감의 멘트' },
              action: { type: 'STRING', description: '20자 이내의 구체적이고 심플한 행동 가이드' },
              music: { type: 'STRING', description: '아티스트 - 노래 제목 형식의 맞춤형 추천 음악' }
            },
            required: ['message', 'action', 'music']
          }
        }
      });

      const cleanText = response.text.trim();
      if (cleanText) aiRecommendation = JSON.parse(cleanText);
    } catch (aiErr) {
      console.warn('⚠️ [AI 제한 혹은 장애 발생] 기본 추천 데이터로 대체 내재화하여 DB 저장을 계속합니다.');
    }

    await db.query(
      `INSERT INTO diaries (user_id, emotion_id, diary_date, content, file_path, ai_message, ai_action, ai_music) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [dbUserId, emotionId, date, content, filePathString, aiRecommendation.message, aiRecommendation.action, aiRecommendation.music]
    );

    // streak 업데이트
    const writeDateStr = date;
    const kstNow = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
    const yesterdayForStreak = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [todayStreak] = await db.query(
      'SELECT id FROM streak_logs WHERE user_id = ? AND streak_date = ?',
      [dbUserId, writeDateStr]
    );

    if (todayStreak.length === 0) {
      // 오늘 streak 기록 없을 때만 insert
      const [lastStreak] = await db.query(
        'SELECT streak_count, streak_date FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
        [dbUserId]
      );

      let newStreakCount = 1;
      if (lastStreak.length > 0) {
        const lastDateStr = new Date(lastStreak[0].streak_date).toISOString().slice(0, 10);
        if (lastDateStr === yesterdayForStreak) {
          newStreakCount = lastStreak[0].streak_count + 1;
        }
      }

      await db.query(
        'INSERT INTO streak_logs (user_id, streak_date, streak_count) VALUES (?, ?, ?)',
        [dbUserId, writeDateStr, newStreakCount]
      );
    }

    res.json({ success: true, aiRecommendation });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', requireLogin, upload.array('mediaFiles'), async (req, res) => {
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

    await db.query(
      'UPDATE diaries SET content = ?, emotion_id = ?, file_path = ? WHERE id = ? AND user_id = ?',
      [content, emotionId, filePathString, diaryId, dbUserId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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