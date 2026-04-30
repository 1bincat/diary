require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./config/db');

const app = express();
const port = 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 세션 설정
app.use(session({
  secret: 'moodly-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 } // 1시간
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

const calendarRouter  = require('./routes/calendar');
const communityRouter = require('./routes/community');
const statisticsRouter     = require('./routes/statistics');
const loginRouter     = require('./routes/login');
const signupRouter    = require('./routes/signup');
const settingsRouter = require('./routes/settings');
const writeRouter     = require('./routes/write');
const homeRouter      = require('./routes/home');

app.use('/login',     loginRouter);
app.use('/signup',    signupRouter);
app.use('/calendar',  calendarRouter);
app.use('/community', communityRouter);
app.use('/',          homeRouter);
app.use('/settings', settingsRouter);
app.use('/write',     writeRouter);
app.use('/statistics',     statisticsRouter);

// 로그아웃
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:3000`);
});


db.getConnection()
  .then(() => console.log('DB 연결 성공!'))
  .catch(err => console.error('DB 연결 실패:', err));

