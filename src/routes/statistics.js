const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('statistics', { path: '/statistics' });
});

module.exports = router;