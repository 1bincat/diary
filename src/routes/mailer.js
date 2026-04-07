const nodemailer = require('nodemailer');
const path = require('path'); // path 모듈 추가

// .env 파일 경로를 직접 지정하여 환경 변수 로드 (안전한 방식)
require('dotenv').config({ path: path.join(__dirname, '../../.env') }); 

// 🔍 터미널에 이메일 주소가 잘 나오는지 확인 (잘 나오면 나중에 지워도 됩니다)
console.log('메일러 설정 계정:', process.env.MAIL_USER);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // service 대신 host를 명시하는 것이 더 안정적입니다.
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ── 회원가입 환영 메일 ──
async function sendWelcomeMail(toEmail, nickname) {
  try {
    const mailOptions = {
      from: `"Moodly" <${process.env.MAIL_USER}>`,
      to: toEmail,
      subject: 'Moodly에 오신 것을 환영합니다 🎉',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #6c63ff;">Moodly에 오신 것을 환영해요!</h2>
          <p><strong>${nickname}</strong>님, 회원가입이 완료되었습니다.</p>
          <p>오늘의 감정을 기록하고 소중한 하루를 Moodly와 함께 남겨보세요.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 0.8rem; color: #aaa;">본 메일은 발신 전용입니다.</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('환영 메일 발송 중 오류:', error);
  }
}

// ── 임시 비밀번호 발급 메일 ──
async function sendTempPasswordMail(toEmail, tempPassword) {
  try {
    const mailOptions = {
      from: `"Moodly" <${process.env.MAIL_USER}>`,
      to: toEmail,
      subject: '[Moodly] 임시 비밀번호를 알려드립니다.',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #6c63ff;">임시 비밀번호 안내</h2>
          <p>아래의 임시 비밀번호로 로그인하신 후, 반드시 비밀번호를 변경해 주세요.</p>
          <div style="
            background: #f4f4f4;
            border-radius: 8px;
            padding: 16px 24px;
            font-size: 1.4rem;
            font-weight: bold;
            letter-spacing: 4px;
            text-align: center;
            margin: 24px 0;
            color: #333;
          ">${tempPassword}</div>
          <p style="color: crimson; font-size: 0.9rem;">⚠️ 로그인 후 반드시 비밀번호를 변경해 주세요.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 0.8rem; color: #aaa;">본 메일은 발신 전용입니다.</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('임시 비번 메일 발송 중 오류:', error);
    throw error; // 에러를 상위(route)로 던져서 처리하게 함
  }
}

module.exports = { sendWelcomeMail, sendTempPasswordMail };