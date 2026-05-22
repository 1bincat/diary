const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const { sendTempPasswordMail } = require('./mailer');

router.get('/', (req, res) => {
  res.render('login', { path: '/login', error: null });
});

// 로그인 처리
router.post('/', async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ?',
      [userId.trim()]
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];

    // bcrypt로 비번 비교
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    req.session.user = { 
      id: user.id, 
      nickname: user.nickname, 
      userId: user.username 
    };

    return res.json({ success: true, redirect: '/' });

  } catch (err) {
    console.error('로그인 오류:', err);
    return res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 찾기
router.post('/find-password', async (req, res) => {
  const { userId, email } = req.body;

  if (!userId || !email) {
    return res.json({ success: false, message: '아이디와 이메일을 모두 입력해주세요.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? AND email = ?',
      [userId.trim(), email.trim()]
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: '일치하는 계정 정보를 찾을 수 없습니다.' });
    }

    const user = rows[0];

    const chars = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
    const tempPassword = Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    // 임시 비번도 해시해서 저장
    const hashedTemp = await bcrypt.hash(tempPassword, 10);
    await db.query(
      'UPDATE users SET password = ? WHERE username = ?', 
      [hashedTemp, userId.trim()]
    );

    await sendTempPasswordMail(user.email, tempPassword);

    return res.json({ success: true, message: '임시 비밀번호를 이메일로 발송했습니다.' });

  } catch (err) {
    console.error('비밀번호 찾기 오류:', err);
    return res.json({ success: false, message: '서버 오류로 인해 메일 발송에 실패했습니다.' });
  }
});

module.exports = router;