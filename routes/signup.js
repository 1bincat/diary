const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendWelcomeMail } = require('./mailer');

router.get('/', (req, res) => {
  res.render('signup', { path: '/signup', error: null });
});

// 아이디 중복확인
router.get('/check-id', async (req, res) => {
  const { userId } = req.query;
  if (!userId || userId.trim() === '') {
    return res.json({ available: false, message: '아이디를 입력해주세요.' });
  }
  try {
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [userId.trim()]);
    if (rows.length > 0) {
      return res.json({ available: false, message: '이미 사용 중인 아이디입니다.' });
    }
    return res.json({ available: true, message: '사용 가능한 아이디입니다.' });
  } catch (err) {
    console.error('중복확인 오류:', err);
    return res.json({ available: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 회원가입 실행
router.post('/', async (req, res) => {
  const { nickname, userId, email, password, passwordConfirm } = req.body;

  if (!nickname || !userId || !email || !password || !passwordConfirm) {
    return res.json({ success: false, message: '모든 항목을 입력해주세요.' });
  }

  if (password !== passwordConfirm) {
    return res.json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
  }

  try {
    const [exists] = await db.query('SELECT id FROM users WHERE username = ?', [userId]);
    if (exists.length > 0) {
      return res.json({ success: false, message: '이미 사용 중인 아이디입니다.' });
    }

    const [emailExists] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (emailExists.length > 0) {
      return res.json({ success: false, message: '이미 사용 중인 이메일입니다.' });
    }

    // 비번 해시 후 저장
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (nickname, username, email, password) VALUES (?, ?, ?, ?)',
      [nickname, userId, email, hashedPassword]
    );

    try {
      await sendWelcomeMail(email, nickname);
    } catch (mailErr) {
      console.error('환영 메일 발송 실패:', mailErr.message);
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('회원가입 오류:', err);
    return res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;