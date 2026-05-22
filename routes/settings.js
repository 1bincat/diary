const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

router.use(requireLogin);

// 설정 페이지
router.get('/', async (req, res) => {
  res.render('settings', { user: req.session.user, path: '/settings', message: null, messageType: '' });
});

// 닉네임 변경
router.post('/nickname', async (req, res) => {
  const { nickname } = req.body;
  try {
    await db.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname.trim(), req.session.user.id]);
    req.session.user.nickname = nickname.trim();
    res.render('settings', { user: req.session.user, path: '/settings', message: '닉네임이 변경되었습니다.', messageType: 'success' });
  } catch (err) {
    console.error(err);
    res.render('settings', { user: req.session.user, path: '/settings', message: '서버 오류가 발생했습니다.', messageType: 'error' });
  }
});

// 이메일 변경
router.post('/email', async (req, res) => {
  const { email } = req.body;
  try {
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (exists.length > 0) {
      return res.render('settings', { user: req.session.user, path: '/settings', message: '이미 사용 중인 이메일입니다.', messageType: 'error' });
    }
    await db.query('UPDATE users SET email = ? WHERE id = ?', [email.trim(), req.session.user.id]);
    res.render('settings', { user: req.session.user, path: '/settings', message: '이메일이 변경되었습니다.', messageType: 'success' });
  } catch (err) {
    console.error(err);
    res.render('settings', { user: req.session.user, path: '/settings', message: '서버 오류가 발생했습니다.', messageType: 'error' });
  }
});

// 비밀번호 변경
router.post('/password', async (req, res) => {
  const { currentPassword, newPassword, newPasswordConfirm } = req.body;
  try {
    if (newPassword !== newPasswordConfirm) {
      return res.render('settings', { user: req.session.user, path: '/settings', message: '새 비밀번호가 일치하지 않습니다.', messageType: 'error' });
    }
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.session.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.render('settings', { user: req.session.user, path: '/settings', message: '현재 비밀번호가 올바르지 않습니다.', messageType: 'error' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.session.user.id]);
    res.render('settings', { user: req.session.user, path: '/settings', message: '비밀번호가 변경되었습니다.', messageType: 'success' });
  } catch (err) {
    console.error(err);
    res.render('settings', { user: req.session.user, path: '/settings', message: '서버 오류가 발생했습니다.', messageType: 'error' });
  }
});

// 회원탈퇴
router.post('/delete', async (req, res) => {
  const { password } = req.body;
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.session.user.id]);
    const isMatch = await bcrypt.compare(password, rows[0].password);
    if (!isMatch) {
      return res.render('settings', { user: req.session.user, path: '/settings', message: '비밀번호가 올바르지 않습니다.', messageType: 'error' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.session.user.id]);
    req.session.destroy();
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('settings', { user: req.session.user, path: '/settings', message: '서버 오류가 발생했습니다.', messageType: 'error' });
  }
});

module.exports = router;