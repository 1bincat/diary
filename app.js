require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./config/db');

const app = express();
const port = 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 📂 정적 파일(이미지, CSS 등)을 웹 브라우저에 제공하는 서랍장 기능 활성화
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

// 라우터 파일 가져오기 (★ communityRouter 가져오는 코드 제거 완료!)
const calendarRouter   = require('./routes/calendar');
const statisticsRouter = require('./routes/statistics');
const loginRouter      = require('./routes/login');
const signupRouter     = require('./routes/signup');
const settingsRouter   = require('./routes/settings');
const writeRouter      = require('./routes/write');
const homeRouter       = require('./routes/home');

// ─── 🚀 라우터 연결 제어 순서 정밀 조정 ───
// 특정 단어로 명확하게 시작하는 주소들을 위쪽에 배치하여 우선권을 줍니다.
app.use('/login',      loginRouter);
app.use('/signup',     signupRouter);
app.use('/calendar',   calendarRouter); // (★ app.use('/community', ...) 코드 제거 완료!)
app.use('/settings',   settingsRouter);
app.use('/write',      writeRouter);
app.use('/statistics', statisticsRouter);

// 가장 넓은 범위인 '/' 대문 라우터는 다른 주소들을 방해하지 않게 맨 아래로 내립니다.
app.use('/',          homeRouter); 

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