const express = require('express');
const router = express.Router();
const db = require('../config/db');

function getDateRange(period, offset) {
  const now = new Date();
  let start, end, label, totalDays;

  if (period === 'day') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    start = end = d.toISOString().slice(0, 10);
    label = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    totalDays = 1;

  } else if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7);
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    start = mon.toISOString().slice(0, 10);
    end   = sun.toISOString().slice(0, 10);
    label = `${mon.getMonth() + 1}/${mon.getDate()} ~ ${sun.getMonth() + 1}/${sun.getDate()}`;
    totalDays = 7;

  } else if (period === 'month') {
    const y = now.getFullYear();
    const m = now.getMonth() + offset;
    const date = new Date(y, m, 1);
    start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end = lastDay.toISOString().slice(0, 10);
    label = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    totalDays = lastDay.getDate();

  } else if (period === 'quarter') {
    const y = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + offset;
    const qNorm = ((q % 4) + 4) % 4;
    const yAdj = y + Math.floor(q / 4);
    start = `${yAdj}-${String(qNorm * 3 + 1).padStart(2, '0')}-01`;
    const endDate = new Date(yAdj, qNorm * 3 + 3, 0);
    end = endDate.toISOString().slice(0, 10);
    label = `${yAdj}년 ${qNorm + 1}분기`;
    totalDays = Math.round((endDate - new Date(start)) / 86400000) + 1;

  } else {
    const y = now.getFullYear() + offset;
    start = `${y}-01-01`;
    end   = `${y}-12-31`;
    label = `${y}년`;
    totalDays = 365;
  }

  return { start, end, label, totalDays };
}

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;
  const period = ['day', 'week', 'month', 'quarter', 'year'].includes(req.query.period)
    ? req.query.period : 'month';
  const offset = parseInt(req.query.offset) || 0;

  const { start, end, label, totalDays } = getDateRange(period, offset);

  try {
    // 감정 분포 (DB emoji, color_code 직접 사용)
    const [emotionRows] = await db.query(`
      SELECT e.name, e.emoji, e.color_code, COUNT(*) AS cnt
      FROM diaries d
      JOIN emotions e ON d.emotion_id = e.id
      WHERE d.user_id = ? AND DATE(d.diary_date) BETWEEN ? AND ?
      GROUP BY e.id, e.name, e.emoji, e.color_code
      ORDER BY cnt DESC
    `, [userId, start, end]);

    const totalEntries = emotionRows.reduce((s, r) => s + r.cnt, 0);
    const maxCount = emotionRows.length > 0 ? emotionRows[0].cnt : 1;

    const emotions = emotionRows.map(r => ({
      name:    r.name,
      icon:    r.emoji,
      color:   r.color_code,
      count:   r.cnt,
      percent: Math.round((r.cnt / maxCount) * 100),
    }));

    // 작성 일수
    const [[{ writtenDays }]] = await db.query(`
      SELECT COUNT(DISTINCT DATE(diary_date)) AS writtenDays
      FROM diaries
      WHERE user_id = ? AND DATE(diary_date) BETWEEN ? AND ?
    `, [userId, start, end]);

    // 현재 스트릭
    const [streakRows] = await db.query(`
      SELECT COALESCE(streak_count, 0) AS currentStreak
      FROM streak_logs
      WHERE user_id = ?
      ORDER BY streak_date DESC LIMIT 1
    `, [userId]);
    const currentStreak = streakRows.length > 0 ? streakRows[0].currentStreak : 0;

    // Top 감정
    const topEmotion = emotions.length > 0 ? {
      ...emotions[0],
      percent: Math.round((emotions[0].count / totalEntries) * 100),
    } : null;

    // 인사이트
    let insight = null;
    if (emotions.length > 0 && totalEntries > 0) {
      const positiveEmotions = ['기쁨', '설렘', '행복', '평온'];
      const posCount = emotionRows
        .filter(r => positiveEmotions.includes(r.name))
        .reduce((s, r) => s + r.cnt, 0);
      const posPct = Math.round((posCount / totalEntries) * 100);
      insight = `이번 기간은 <strong>긍정 감정</strong>이 전체의 ${posPct}%를 차지했어요.`;
      if (topEmotion) {
        insight += `<br>가장 많이 기록한 감정은 ${topEmotion.icon} <strong>${topEmotion.name}</strong>이에요.`;
      }
    }

    res.render('statistics', {
      path:        '/statistics',
      user:        req.session.user,
      period,
      offset,
      periodLabel: label,
      totalDays,
      writtenDays,
      totalEntries,
      currentStreak,
      emotions,
      topEmotion,
      insight,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('통계를 불러오는 중 오류가 발생했습니다.');
  }
});

module.exports = router;