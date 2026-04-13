const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/');
  }
  next();
}

// 오늘의 한마디 & 추천 음악 데이터
const quotes = [
  '오늘 하루도 충분히 잘 했어요.\n소소한 일상이 쌓여 좋은 기억이 됩니다 :)',
  '하루하루가 모여 나를 만들어요.\n오늘도 수고했어요!',
  '지금 이 순간도 소중한 기억이에요.\n잘 기록해두세요 😊',
];

const musicList = [
  { title: 'Hearts2Hearts – RUDE!', artist: '마음 설레는 하루라면' },
  { title: 'IU – Blueming', artist: '행복한 기분일 때' },
  { title: 'Norah Jones – Come Away With Me', artist: '평온한 저녁에' },
];

// routes/write.js

// routes/write.js

// routes/write.js

router.get('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  
  // 1. 변수를 미리 선언해둡니다 (초기값 0)
  let userStreak = 0; 

  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // 유저 고유 ID 가져오기
    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    const dbUserId = userRows[0].id;

    // 2. streak_logs 테이블에서 최신 streak_count 조회
    const [streakRows] = await db.query(
      'SELECT streak_count FROM streak_logs WHERE user_id = ? ORDER BY streak_date DESC LIMIT 1',
      [dbUserId]
    );
    
    // 데이터가 있다면 변수에 할당
    if (streakRows.length > 0) {
      userStreak = streakRows[0].streak_count;
    }

    // 오늘 작성한 일기 목록 가져오기
    const [diaries] = await db.query(
      'SELECT *, DATE_FORMAT(created_at, "%H:%i") as time FROM diaries WHERE user_id = ? AND diary_date = ? ORDER BY created_at ASC',
      [dbUserId, today]
    );

    // 3. 페이지 렌더링 (userStreak가 위에서 정의되었으므로 에러가 나지 않습니다)
    res.render('write', { 
      path: '/write',
      diaries: diaries,
      streak: userStreak, 
      selectedEmotion: 0
    });

  } catch (err) {
    console.error('작성 페이지 로드 오류:', err);
    // 에러 발생 시에도 streak 변수를 포함하여 렌더링하거나 리다이렉트
    res.redirect('/');
  }
});

// [routes/write.js 수정 버전]
router.post('/', requireLogin, async (req, res) => {
  const userId = req.session.user.userId;
  const { content, emotionId } = req.body;

  if (!content || !emotionId) {
    return res.json({ success: false, message: '내용과 감정을 모두 입력해주세요.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [userRows] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    const dbUserId = userRows[0].id;

    // ★ 수정 포인트: 기존의 SELECT id FROM diaries 로직을 삭제합니다.
    // 무조건 새로운 레코드를 삽입(INSERT)하여 여러 번 기록이 가능하게 합니다.
    await db.query(
      'INSERT INTO diaries (user_id, emotion_id, diary_date, content) VALUES (?, ?, ?, ?)',
      [dbUserId, emotionId, today, content]
    );

    // streak 업데이트 (필요 시 유지)
    await updateStreak(dbUserId, today);

    return res.json({ success: true });

  } catch (err) {
    console.error('일기 저장 오류:', err);
    // 에러 메시지가 'Duplicate entry'라면 DB 테이블에서 diary_date의 Unique 설정을 해제해야 합니다.
    return res.json({ success: false, message: '저장에 실패했습니다. (DB 제약 조건 확인 필요)' });
  }
});

// streak 계산 함수
async function updateStreak(userId, today) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const [yesterdayDiary] = await db.query(
      'SELECT id FROM diaries WHERE user_id = ? AND diary_date = ?',
      [userId, yesterdayStr]
    );

    const [lastStreak] = await db.query(
      'SELECT streak_count FROM streak_logs WHERE user_id = ? AND streak_date = ?',
      [userId, yesterdayStr]
    );

    const newStreak = yesterdayDiary.length > 0 && lastStreak.length > 0
      ? lastStreak[0].streak_count + 1
      : 1;

    await db.query(
      'INSERT INTO streak_logs (user_id, streak_date, streak_count) VALUES (?, ?, ?)',
      [userId, today, newStreak]
    );

  } catch (err) {
    console.error('streak 업데이트 오류:', err);
  }
}

// 수정
router.post('/edit/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.session.user.id;

    await db.query(
      'UPDATE diaries SET content = ? WHERE id = ? AND user_id = ?',
      [content, id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// 삭제
router.post('/delete/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    await db.query(
      'DELETE FROM diaries WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

module.exports = router;

// [routes/write.js 에 추가해야 할 함수]

async function updateStreak(userId, today) {
  try {
    // 유저의 연속 기록(streak) 정보를 가져옵니다.
    const [rows] = await db.query('SELECT last_diary_date, streak FROM users WHERE id = ?', [userId]);
    let { last_diary_date, streak } = rows[0];

    if (!last_diary_date) {
      // 처음 쓰는 경우
      streak = 1;
    } else {
      const lastDate = new Date(last_diary_date).toISOString().slice(0, 10);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (lastDate === today) {
        // 오늘 이미 썼다면 점수 유지 (여러 번 기록 시 중복 방지)
        return;
      } else if (lastDate === yesterdayStr) {
        // 어제 썼다면 +1
        streak += 1;
      } else {
        // 어제 안 썼다면 다시 1부터 시작
        streak = 1;
      }
    }

    // DB 업데이트
    await db.query('UPDATE users SET last_diary_date = ?, streak = ? WHERE id = ?', [today, streak, userId]);
  } catch (err) {
    console.error('Streak 업데이트 오류:', err);
  }
}